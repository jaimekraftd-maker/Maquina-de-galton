import { describe, expect, it } from "vitest";
import { buildContextWindow, CONVERSATION_START, EARLIER_OMITTED, estimateTokens } from "@/lib/ai/context";
import type { ChatTurn } from "@/lib/ai/types";

const turn = (role: ChatTurn["role"], content: string): ChatTurn => ({ role, content });

describe("buildContextWindow", () => {
  it("prepends a user turn when history starts with the greeting", () => {
    const { messages, omitted } = buildContextWindow([turn("assistant", "Hello traveler"), turn("user", "Hi")], 10_000);
    expect(omitted).toBe(0);
    expect(messages[0]).toEqual({ role: "user", content: CONVERSATION_START });
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("keeps only the most recent messages that fit the budget", () => {
    const history = Array.from({ length: 40 }, (_, i) => turn(i % 2 ? "user" : "assistant", `message ${i} `.repeat(20)));
    const budget = estimateTokens(history[0].content) * 5;
    const { messages, omitted } = buildContextWindow(history, budget);
    expect(omitted).toBeGreaterThan(0);
    expect(messages.at(-1)!.content).toBe(history.at(-1)!.content);
    expect(messages[0].role).toBe("user");
    if (messages[0].content === EARLIER_OMITTED) expect(messages[1].role).toBe("assistant");
  });

  it("always keeps the latest message even if it exceeds the budget", () => {
    const { messages } = buildContextWindow([turn("user", "x".repeat(10_000))], 10);
    expect(messages).toHaveLength(1);
  });

  it("merges consecutive turns from the same role", () => {
    const { messages } = buildContextWindow([turn("user", "a"), turn("user", "b"), turn("assistant", "c")], 1000);
    expect(messages).toEqual([turn("user", "a\n\nb"), turn("assistant", "c")]);
  });
});
