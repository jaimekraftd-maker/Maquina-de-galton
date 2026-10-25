import type { ConversationMemory, Message } from "@/lib/data/types";
import { estimateTokens } from "./context";
import type { ChatProvider } from "./types";

export const MEMORY_MAX_CHARS = 8000;
/** Share of the history budget given to earlier messages quoted word for word. */
export const RECALL_SHARE = 0.15;
/** After folding, the recent history should use at most this share of the budget, so the
 * summary is only rewritten every so often rather than on every turn. */
const KEEP_RATIO = 0.6;
/** Always keep at least the latest exchange verbatim. */
const MIN_KEEP = 2;

export interface MemoryPlan {
  /** Messages to fold into the summary now (oldest first); empty when nothing needs folding. */
  fold: Message[];
  /** Messages to send verbatim after the summary. */
  keep: Message[];
  /** New throughSeq once `fold` has been summarized. */
  throughSeq: number | null;
}

const cost = (msgs: Message[]) => msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);

/**
 * Decides whether older messages must be folded into the conversation memory so the
 * remaining history fits `budgetTokens`. Messages already covered by `memory` are skipped.
 */
export function planMemory(history: Message[], memory: ConversationMemory | null | undefined, budgetTokens: number): MemoryPlan {
  const active = memory ? history.filter((m) => m.seq > memory.throughSeq) : history;
  const summaryCost = memory ? estimateTokens(memory.summary) : 0;
  if (cost(active) + summaryCost <= budgetTokens) return { fold: [], keep: active, throughSeq: null };

  // Keep the newest messages that fit in KEEP_RATIO of the budget (and at least MIN_KEEP),
  // leaving room for the summary so the next turns don't immediately fold again.
  const target = Math.max(0, budgetTokens * KEEP_RATIO - summaryCost);
  let cut = active.length;
  let used = 0;
  while (cut > 0) {
    const next = estimateTokens(active[cut - 1].content);
    const keptCount = active.length - cut;
    if (keptCount >= MIN_KEEP && used + next > target) break;
    used += next;
    cut--;
  }
  if (cut === 0) return { fold: [], keep: active, throughSeq: null };
  const fold = active.slice(0, cut);
  return { fold, keep: active.slice(cut), throughSeq: fold[fold.length - 1].seq };
}

/** Splits messages into chunks small enough to summarize in one request. */
export function chunkMessages(messages: Message[], maxTokens: number): Message[][] {
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let used = 0;
  for (const m of messages) {
    const c = estimateTokens(m.content);
    if (current.length && used + c > maxTokens) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(m);
    used += c;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function summaryPrompt(characterName: string, userName: string) {
  return `You keep the long-term memory for an ongoing roleplay chat between ${userName} (the user) and the fictional character ${characterName}.

The older messages will no longer be visible, so the memory must keep every detail that could matter later. Use exactly these sections:

## About ${userName}
Name, appearance, preferences, background, and anything they asked to be remembered.

## Things ${userName} made, designed, gave or described
Every creation, design, gift or idea (for example outfits, dresses, drawings, names, plans), each with its concrete details: colours, materials, shapes, who it was for and what ${characterName} thought of it. Never shorten or drop an entry here.

## People, places and objects
Names and one-line descriptions.

## Story so far
What happened, in order, ending with the current situation and location.

## Relationship and open threads
Feelings, promises, plans and unresolved questions.

When updating, merge the existing memory with the new messages. Keep every entry from the existing memory unless it is clearly contradicted, and add new details. Skip small talk. Write in the third person, using short bullet points. Output only the memory.`;
}

/**
 * Folds `messages` into `previous` with the chat's own provider, chunk by chunk.
 * Throws ProviderError (including "aborted") like any generation.
 */
export async function summarize(
  provider: ChatProvider,
  opts: {
    characterName: string;
    userName: string;
    previous: string | null;
    messages: Message[];
    chunkTokens: number;
    signal: AbortSignal;
  },
): Promise<string> {
  const system = summaryPrompt(opts.characterName, opts.userName);
  let summary = opts.previous ?? "";
  for (const chunk of chunkMessages(opts.messages, opts.chunkTokens)) {
    const lines = chunk.map((m) => `${m.role === "user" ? opts.userName : opts.characterName}: ${m.content}`).join("\n\n");
    let out = "";
    await provider.generate({
      purpose: "summary",
      system,
      messages: [
        {
          role: "user",
          content: `Existing memory:\n${summary || "(nothing yet)"}\n\nNew messages to add:\n\n${lines}\n\nWrite the updated memory.`,
        },
      ],
      signal: opts.signal,
      onText: (d) => (out += d),
    });
    if (out.trim()) summary = out.trim().slice(0, MEMORY_MAX_CHARS);
  }
  return summary;
}
