import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/http";
import { config } from "@/lib/config";
import { getProvider } from "@/lib/ai";
import { buildContextWindow } from "@/lib/ai/context";
import { planMemory, RECALL_SHARE, summarize } from "@/lib/ai/memory";
import { formatRecalled, recall } from "@/lib/ai/recall";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { ProviderError } from "@/lib/ai/types";
import { beginGeneration, endGeneration } from "@/lib/chat/generations";
import type { ChatErrorBody, ChatStreamEvent } from "@/lib/chat/events";
import { ConfigurationError, getContext } from "@/lib/data";
import type { Message } from "@/lib/data/types";
import { RateLimiter } from "@/lib/rate-limit";
import { chatRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __nocturneChatLimiter?: RateLimiter };
const limiter = (g.__nocturneChatLimiter ??= new RateLimiter(config.ai.rateLimitPerMinute, 60_000));

function fail(status: number, code: string, error: string, extra: Partial<ChatErrorBody> = {}) {
  return NextResponse.json<ChatErrorBody>({ error, code, ...extra }, { status });
}

function titleFrom(text: string) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine || "New chat";
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  let ctx;
  try {
    ctx = await getContext();
  } catch (err) {
    if (err instanceof ConfigurationError) return fail(503, "not_configured", err.message);
    throw err;
  }
  const { store, viewer } = ctx;
  if (!viewer) return fail(401, "unauthorized", "Sign in to chat.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "Invalid JSON body.");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  const req = parsed.data;

  const conversation = await store.getConversation(viewer.id, req.conversationId);
  if (!conversation) return fail(404, "not_found", "Conversation not found.");
  const character = await store.getCharacter(viewer.id, conversation.characterId);
  if (!character) return fail(409, "character_unavailable", "This character is no longer available.");

  const provider = getProvider();
  const problem = provider.configurationProblem();
  if (problem) {
    return fail(503, "not_configured", `The AI provider isn't configured: ${problem} See README → "Configure the AI provider".`);
  }

  const retryMs = limiter.take(viewer.id);
  if (retryMs > 0) {
    const retryAfterSeconds = Math.ceil(retryMs / 1000);
    return fail(429, "rate_limited", `You're sending messages too quickly. Try again in ${retryAfterSeconds}s.`, {
      retryAfterSeconds,
    });
  }

  const controller = beginGeneration(conversation.id, viewer.id);
  if (!controller) return fail(409, "busy", "A reply is already being generated in this chat.");

  // --- Apply the requested change to the history before generating ----------
  let history: Message[];
  let userMessage: Message | null = null;
  const removedMessageIds: string[] = [];
  try {
    history = await store.listMessages(viewer.id, conversation.id);
    const last = history.at(-1);

    switch (req.mode) {
      case "send": {
        if (!history.some((m) => m.role === "user")) {
          await store.updateConversation(viewer.id, conversation.id, { title: titleFrom(req.content) });
        }
        userMessage = await store.addMessage(viewer.id, conversation.id, "user", req.content);
        history.push(userMessage);
        break;
      }
      case "edit": {
        const lastUser = [...history].reverse().find((m) => m.role === "user");
        if (!lastUser || lastUser.id !== req.messageId) {
          endGeneration(conversation.id, controller);
          return fail(409, "conflict", "Only your most recent message can be edited.");
        }
        await store.updateMessage(viewer.id, lastUser.id, req.content, { edited: true });
        await store.deleteMessagesAfter(viewer.id, conversation.id, lastUser.seq);
        removedMessageIds.push(...history.filter((m) => m.seq > lastUser.seq).map((m) => m.id));
        history = history.filter((m) => m.seq <= lastUser.seq);
        userMessage = { ...lastUser, content: req.content, metadata: { ...lastUser.metadata, edited: true } };
        history[history.length - 1] = userMessage;
        break;
      }
      case "regenerate": {
        if (!last || last.role !== "assistant" || !history.some((m) => m.role === "user")) {
          endGeneration(conversation.id, controller);
          return fail(409, "conflict", "There's no reply to regenerate yet.");
        }
        await store.deleteMessage(viewer.id, last.id);
        removedMessageIds.push(last.id);
        history.pop();
        break;
      }
      case "retry": {
        if (!last || last.role !== "user") {
          endGeneration(conversation.id, controller);
          return fail(409, "conflict", "Nothing to retry.");
        }
        break;
      }
    }
  } catch (err) {
    endGeneration(conversation.id, controller);
    console.error("[chat] failed to prepare history:", err);
    return fail(500, "storage_error", "Couldn't save your message. Please try again.");
  }

  const system = buildSystemPrompt(character, viewer.displayName);
  const budget = config.ai.contextMaxTokens;

  // If the client disconnects (tab closed, navigation), stop generating.
  request.signal.addEventListener("abort", () => controller.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "start", userMessage, removedMessageIds, provider: provider.id, model: provider.model });

      let text = "";
      try {
        // Long chats: fold the oldest messages into the conversation's memory so the
        // character keeps remembering them once they no longer fit in the context.
        let memory = conversation.memory ?? null;
        const plan = planMemory(history, memory, budget);
        if (plan.fold.length && plan.throughSeq !== null) {
          send({ type: "status", text: `Updating ${character.name}'s memory…` });
          try {
            const summary = await summarize(provider, {
              characterName: character.name,
              userName: viewer.displayName,
              previous: memory?.summary ?? null,
              messages: plan.fold,
              chunkTokens: budget,
              signal: controller.signal,
            });
            if (summary) {
              memory = { summary, throughSeq: plan.throughSeq };
              await store.setConversationMemory(viewer.id, conversation.id, memory);
            }
          } catch (err) {
            if (controller.signal.aborted) throw err;
            // Not fatal: reply with the recent history only.
            console.error("[chat] memory update failed:", err);
          }
        }
        const recent = memory ? history.filter((m) => m.seq > memory.throughSeq) : history;
        // Quote the earlier messages that relate to what the user just said, word for word,
        // so details the summary condensed (descriptions, designs, names) aren't lost.
        const older = memory ? history.filter((m) => m.seq <= memory.throughSeq) : [];
        const latest = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
        const recalled = recall(older, latest, Math.floor(budget * RECALL_SHARE));
        const window = buildContextWindow(
          recent.map((m) => ({ role: m.role, content: m.content })),
          budget,
          memory?.summary,
          recalled.length ? formatRecalled(recalled, viewer.displayName, character.name) : null,
        );

        const result = await provider.generate({
          system,
          messages: window.messages,
          signal: controller.signal,
          onText: (delta) => {
            text += delta;
            send({ type: "delta", text: delta });
          },
        });

        const refused = Boolean(result.refused);
        const content =
          text.trim() ||
          (refused ? `*${character.name} doesn't respond to that. Try taking the conversation in another direction.*` : "…");
        const message = await store.addMessage(viewer.id, conversation.id, "assistant", content, {
          provider: provider.id,
          model: result.model,
          stopReason: result.stopReason,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        send({ type: "done", message, refused, interrupted: false });
      } catch (err) {
        const pe =
          err instanceof ProviderError ? err : new ProviderError("unknown", "Something went wrong while generating a reply.", true);
        if (!(err instanceof ProviderError)) console.error("[chat] generation failed:", err);

        // Keep whatever was generated before the stop / failure.
        let partial: Message | null = null;
        if (text.trim()) {
          try {
            partial = await store.addMessage(viewer.id, conversation.id, "assistant", text, {
              provider: provider.id,
              model: provider.model,
              interrupted: true,
              stopReason: pe.kind,
            });
          } catch (saveErr) {
            console.error("[chat] failed to save partial reply:", saveErr);
          }
        }
        if (pe.kind === "aborted" && partial) {
          send({ type: "done", message: partial, refused: false, interrupted: true });
        } else if (pe.kind === "aborted") {
          send({ type: "error", error: "Generation stopped.", code: "aborted", retryable: true, message: null });
        } else {
          send({ type: "error", error: pe.message, code: pe.kind, retryable: pe.retryable, message: partial });
        }
      } finally {
        endGeneration(conversation.id, controller);
        closed = true;
        try {
          sink.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
