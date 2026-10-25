import "server-only";
import { ProviderError, type ChatProvider, type GenerateRequest, type GenerateResult } from "./types";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("aborted", "Generation stopped.", false));
    });
  });

/**
 * Development-only scripted provider for working on the UI without an API key.
 * It is clearly labelled in every reply and refuses to run in production.
 */
export class DemoProvider implements ChatProvider {
  readonly id = "demo";
  readonly model = "demo-scripted";

  configurationProblem(): string | null {
    return process.env.NODE_ENV === "production"
      ? "The demo provider is disabled in production. Configure a real AI provider."
      : null;
  }

  async generate({ purpose, system, messages, signal, onText }: GenerateRequest): Promise<GenerateResult> {
    if (purpose === "summary") {
      // Not a real summary: keeps the most recent lines so memory can be exercised without AI.
      const text = messages.at(-1)?.content ?? "";
      onText(`[Demo memory] ${text.split("New messages to add:").pop()?.trim().slice(-1500) ?? ""}`);
      return { model: this.model, stopReason: "end_turn" };
    }
    const name = /^You are (.+?), a fictional character/m.exec(system)?.[1] ?? "The character";
    const last = messages.at(-1)?.content ?? "";
    const reply =
      `*[Demo provider — scripted placeholder, not AI]* ${name} considers your words: “${last.slice(0, 120)}”. ` +
      `Connect a model provider (set ANTHROPIC_API_KEY) to get real, in-character replies.`;
    for (const word of reply.split(/(?<= )/)) {
      if (signal.aborted) throw new ProviderError("aborted", "Generation stopped.", false);
      onText(word);
      await sleep(25, signal);
    }
    return { model: this.model, stopReason: "end_turn" };
  }
}
