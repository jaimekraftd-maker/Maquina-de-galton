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
 * Selects the most recent messages that fit within `budgetTokens`, always
 * keeping the latest message, and normalizes the result so it starts with a
 * user turn (the greeting is stored as an assistant message).
 */
export function buildContextWindow(history: ChatTurn[], budgetTokens: number): ContextWindow {
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

  if (merged[0]?.role === "assistant") {
    merged.unshift({ role: "user", content: omitted > 0 ? EARLIER_OMITTED : CONVERSATION_START });
  }
  return { messages: merged, omitted };
}
