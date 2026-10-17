import "server-only";
import { tmpdir } from "node:os";
import { config } from "@/lib/config";
import { ProviderError, type ChatProvider, type ChatTurn, type GenerateRequest, type GenerateResult } from "./types";

/**
 * Claude through the Claude Agent SDK (@anthropic-ai/claude-agent-sdk), which
 * runs Claude Code under the hood and uses the Claude Code login on this
 * computer (your Claude subscription) instead of an API key.
 *
 * For personal use on your own machine only: Anthropic does not allow offering
 * claude.ai login to other people's accounts through your product. Hosted /
 * multi-user deployments must use the "anthropic" provider with an API key.
 */
export class ClaudeCodeProvider implements ChatProvider {
  readonly id = "claude-code";

  constructor(readonly model: string = config.ai.model) {}

  configurationProblem(): string | null {
    // The login lives in Claude Code's own credential store (or the OS keychain),
    // so it can't be checked up front; a missing login is reported per request.
    return null;
  }

  async generate({ system, messages, signal, onText }: GenerateRequest): Promise<GenerateResult> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const abortController = new AbortController();
    let run: ReturnType<typeof query> | null = null;
    // Stop: cancel the SDK call and make sure the Claude Code process exits.
    const onAbort = () => {
      abortController.abort();
      run?.close();
    };
    signal.addEventListener("abort", onAbort);

    // Without this, an ANTHROPIC_API_KEY in the environment would take precedence
    // over the subscription login.
    const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "nocturne/0.1" };
    if (process.env.NOCTURNE_CLAUDE_CODE_USE_API_KEY !== "true") delete env.ANTHROPIC_API_KEY;

    let streamed = "";
    let failure: ProviderError | null = null;
    let result: GenerateResult | null = null;
    try {
      if (signal.aborted) throw new ProviderError("aborted", "Generation stopped.", false);
      run = query({
        prompt: transcript(messages),
        options: {
          model: this.model,
          systemPrompt: `${system}\n\n${IGNORE_RUNTIME}`,
          // A plain chat model: no file, shell or web tools, one reply per request.
          tools: [],
          maxTurns: 1,
          settingSources: [],
          strictMcpConfig: true,
          persistSession: false,
          includePartialMessages: true,
          cwd: tmpdir(),
          abortController,
          env,
          ...(process.env.AI_EFFORT === "off" ? {} : { effort: config.ai.effort }),
        },
      });

      for await (const m of run) {
        if (m.type === "stream_event") {
          const ev = m.event;
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            streamed += ev.delta.text;
            onText(ev.delta.text);
          }
        } else if (m.type === "assistant" && m.error) {
          failure = fromAssistantError(m.error);
          break;
        } else if (m.type === "system" && m.subtype === "api_retry" && NOT_RETRYABLE.has(m.error)) {
          // Retrying won't fix a missing login or billing problem; report it now.
          failure = fromAssistantError(m.error);
          break;
        } else if (m.type === "auth_status" && m.error) {
          failure = notLoggedIn();
          break;
        } else if (m.type === "result") {
          if (m.subtype !== "success" || m.is_error) {
            failure = fromResultText(m.subtype === "success" ? m.result : m.errors.join(" "));
            break;
          }
          // Some runs deliver the reply only in the final result.
          if (!streamed && m.result) onText(m.result);
          result = {
            model: this.model,
            stopReason: m.stop_reason,
            inputTokens: m.usage.input_tokens,
            outputTokens: m.usage.output_tokens,
            refused: m.stop_reason === "refusal",
          };
          break;
        }
      }
    } catch (err) {
      if (!failure) failure = toProviderError(err, signal);
    } finally {
      signal.removeEventListener("abort", onAbort);
      run?.close();
    }

    if (signal.aborted) throw new ProviderError("aborted", "Generation stopped.", false);
    if (failure) throw failure;
    if (!result) throw new ProviderError("unknown", "Claude Code ended without a reply. Please retry.", true);
    return result;
  }
}

function toProviderError(err: unknown, signal: AbortSignal): ProviderError {
  if (err instanceof ProviderError) return err;
  if (signal.aborted) return new ProviderError("aborted", "Generation stopped.", false);
  const message = err instanceof Error ? err.message : String(err);
  if (/native cli binary|ENOENT|spawn/i.test(message)) {
    console.error("[ai] claude-code could not start:", message);
    return new ProviderError(
      "not_configured",
      "Couldn't start Claude Code. Re-run `npm install` (it needs the platform binary), then retry.",
      false,
    );
  }
  return fromResultText(message);
}

// Claude Code adds its own runtime context (working directory, OS, date) to each request.
const IGNORE_RUNTIME =
  "You may also see environment details such as a working directory, operating system or tool notes. They come from the app's runtime, not the story: never mention or act on them.";

const NOT_RETRYABLE = new Set(["authentication_failed", "oauth_org_not_allowed", "billing_error", "account_on_hold", "model_not_found", "invalid_request"]);

/** The SDK takes one prompt per call, so earlier turns are passed as a transcript. */
export function transcript(messages: ChatTurn[]): string {
  const history = messages.slice(0, -1);
  const last = messages.at(-1)?.content ?? "";
  const lines = history.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n\n");
  return [
    history.length ? `Conversation so far:\n\n${lines}\n\n---\n\n` : "",
    `The user now says:\n\n${last}\n\n`,
    "Reply in character with your next message only. Do not add a speaker label.",
  ].join("");
}

function notLoggedIn() {
  return new ProviderError(
    "auth",
    "Claude Code isn't logged in on this computer. Open a terminal, run `claude`, log in with your Claude account, then retry.",
    false,
  );
}

function fromAssistantError(code: string): ProviderError {
  switch (code) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return notLoggedIn();
    case "rate_limit":
      return new ProviderError("rate_limit", "You've hit your Claude plan's usage limit. Wait a bit and retry.", true);
    case "overloaded":
    case "server_error":
      return new ProviderError("overloaded", "Claude is busy right now. Please retry shortly.", true);
    case "billing_error":
    case "account_on_hold":
      return new ProviderError("auth", "Your Claude account can't be used right now (billing or account status).", false);
    case "model_not_found":
    case "invalid_request":
      return new ProviderError("bad_request", "Claude rejected the request. Check AI_MODEL in .env.local.", false);
    default:
      return new ProviderError("unknown", "Claude Code returned an error. Please retry.", true);
  }
}

function fromResultText(text: string): ProviderError {
  if (/log ?in|not logged|authenticat|credential|api key|oauth/i.test(text)) return notLoggedIn();
  if (/rate.?limit|usage limit/i.test(text)) {
    return new ProviderError("rate_limit", "You've hit your Claude plan's usage limit. Wait a bit and retry.", true);
  }
  console.error("[ai] claude-code error:", text);
  return new ProviderError("unknown", "Claude Code returned an error. Please retry.", true);
}
