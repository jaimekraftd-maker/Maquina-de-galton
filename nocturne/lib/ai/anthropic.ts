import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import { ProviderError, type ChatProvider, type GenerateRequest, type GenerateResult } from "./types";

// Models that accept the server-side `fallbacks: "default"` parameter on the Claude API.
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/**
 * Claude via the official Anthropic TypeScript SDK (@anthropic-ai/sdk).
 * Credentials are read by the SDK from ANTHROPIC_API_KEY (server-side only).
 */
export class AnthropicProvider implements ChatProvider {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  constructor(readonly model: string = config.ai.model) {}

  configurationProblem(): string | null {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      return "ANTHROPIC_API_KEY is not set on the server. To use your Claude subscription instead, set AI_PROVIDER=claude-code and log in with `claude`.";
    }
    return null;
  }

  private sdk(): Anthropic {
    this.client ??= new Anthropic({ timeout: config.ai.timeoutMs, maxRetries: 2 });
    return this.client;
  }

  async generate({ system, messages, signal, onText }: GenerateRequest): Promise<GenerateResult> {
    const useFallbacks = config.ai.serverFallbacks && SERVER_FALLBACK_MODELS.has(this.model);
    const effort = process.env.AI_EFFORT === "off" ? undefined : config.ai.effort;

    try {
      const stream = this.sdk().beta.messages.stream(
        {
          model: this.model,
          max_tokens: config.ai.maxOutputTokens,
          // The character definition is stable across turns: cache it.
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages,
          // Also cache the growing conversation prefix between turns.
          cache_control: { type: "ephemeral" },
          ...(effort ? { output_config: { effort } } : {}),
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal },
      );

      stream.on("text", (delta) => onText(delta));
      const final = await stream.finalMessage();

      return {
        model: final.model,
        stopReason: final.stop_reason,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        refused: final.stop_reason === "refusal",
      };
    } catch (err) {
      throw toProviderError(err, signal);
    }
  }
}

function toProviderError(err: unknown, signal: AbortSignal): ProviderError {
  if (err instanceof ProviderError) return err;
  if (signal.aborted || err instanceof Anthropic.APIUserAbortError) {
    return new ProviderError("aborted", "Generation stopped.", false);
  }
  // Most specific first; APIConnectionError is a subclass of APIError in this SDK.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError("timeout", "The AI provider took too long to respond. Please try again.", true);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("network", "Couldn't reach the AI provider. Check your connection and try again.", true);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "The AI provider rejected the server's credentials. Check ANTHROPIC_API_KEY.", false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("rate_limit", "The AI provider is rate limiting requests. Wait a moment and retry.", true);
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    console.error("[ai] request rejected:", err.message);
    return new ProviderError("bad_request", "The AI provider rejected the request. Check the model configuration.", false);
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || err.status === 503) {
      return new ProviderError("overloaded", "The AI provider is overloaded right now. Please retry shortly.", true);
    }
    console.error(`[ai] provider error ${err.status}:`, err.message);
    return new ProviderError("unknown", "The AI provider returned an error. Please retry.", true);
  }
  console.error("[ai] unexpected error:", err);
  return new ProviderError("unknown", "Something went wrong while generating a reply.", true);
}
