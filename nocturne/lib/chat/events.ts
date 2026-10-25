import type { Message } from "@/lib/data/types";

/** Newline-delimited JSON events streamed by POST /api/chat. */
export type ChatStreamEvent =
  | { type: "start"; userMessage: Message | null; removedMessageIds: string[]; provider: string; model: string }
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; message: Message; refused: boolean; interrupted: boolean }
  | { type: "error"; error: string; code: string; retryable: boolean; message: Message | null };

export interface ChatErrorBody {
  error: string;
  code: string;
  retryAfterSeconds?: number;
}
