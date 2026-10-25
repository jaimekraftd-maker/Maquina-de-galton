import type { ChatTurn } from "./types";

/** Cheap, conservative token estimate (~3.5 characters per token for English prose). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5) + 4;
}

export interface ContextWindow {
  messages: ChatTurn[];
  /** Number of older messages dropped to fit the budget. */
  omitted: number;
}

export const CONVERSATION_START = "(The conversation begins.)";
export const EARLIER_OMITTED = "(Earlier parts of this conversation are not shown.)";

/**
 * The note that leads the context once a chat has a memory: the summary of older
 * messages plus, when available, earlier messages quoted word for word because they
 * relate to what the user just said.
 */
export function memoryNote(summary: string | null, recalled?: string | null) {
  const parts = [];
  if (summary) {
    parts.push(`(Memory of what happened earlier in this conversation. Stay consistent with it, but don't recite it.)\n${summary}`);
  }
  if (recalled) {
    parts.push(
      `(Earlier moments from this conversation that relate to the latest message, quoted exactly. Use their details faithfully.)\n${recalled}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Selects the most recent messages that fit within `budgetTokens`, always
 * keeping the latest message, and normalizes the result so it starts with a
 * user turn (the greeting is stored as an assistant message). When the chat
 * has a memory summary of older messages, it leads the window.
 */
export function buildContextWindow(
  history: ChatTurn[],
  budgetTokens: number,
  memory?: string | null,
  recalled?: string | null,
): ContextWindow {
  const note = memory || recalled ? memoryNote(memory ?? null, recalled) : null;
  if (note) budgetTokens = Math.max(1000, budgetTokens - estimateTokens(note));
  const kept: ChatTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].content);
    if (kept.length > 0 && used + cost > budgetTokens) break;
    kept.unshift(history[i]);
    used += cost;
  }
  const omitted = history.length - kept.length;

  // Merge consecutive turns from the same role into one turn.
  const merged: ChatTurn[] = [];
  for (const turn of kept) {
    const prev = merged.at(-1);
    if (prev && prev.role === turn.role) prev.content = `${prev.content}\n\n${turn.content}`;
    else merged.push({ ...turn });
  }

  const lead = note ?? (omitted > 0 ? EARLIER_OMITTED : CONVERSATION_START);
  if (merged[0]?.role === "assistant") {
    merged.unshift({ role: "user", content: lead });
  } else if (note && merged[0]) {
    merged[0] = { ...merged[0], content: `${lead}\n\n${merged[0].content}` };
  }
  return { messages: merged, omitted };
}
