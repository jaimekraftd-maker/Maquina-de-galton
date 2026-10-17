import type { ChatErrorBody, ChatStreamEvent } from "./events";

/** Parses a newline-delimited JSON response body into events. */
export async function* readEvents(res: Response): AsyncGenerator<ChatStreamEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as ChatStreamEvent;
    }
  }
  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as ChatStreamEvent;
}

export async function readError(res: Response): Promise<ChatErrorBody> {
  try {
    const body = (await res.json()) as Partial<ChatErrorBody>;
    return { error: body.error ?? `Request failed (${res.status})`, code: body.code ?? "error", retryAfterSeconds: body.retryAfterSeconds };
  } catch {
    return { error: `Request failed (${res.status})`, code: "error" };
  }
}
