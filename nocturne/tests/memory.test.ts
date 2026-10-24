import { describe, expect, it } from "vitest";
import { buildContextWindow, estimateTokens, memoryNote } from "@/lib/ai/context";
import { chunkMessages, planMemory, summarize } from "@/lib/ai/memory";
import type { ChatProvider, GenerateRequest } from "@/lib/ai/types";
import type { Message } from "@/lib/data/types";

const msg = (seq: number, content: string, role: Message["role"] = seq % 2 ? "user" : "assistant"): Message => ({
  id: `m${seq}`,
  conversationId: "c",
  role,
  content,
  seq,
  metadata: {},
  createdAt: "",
});

const long = (seq: number) => msg(seq, `message ${seq} `.repeat(60)); // ~200 tokens each
const chat = (n: number) => Array.from({ length: n }, (_, i) => long(i + 1));

describe("planMemory", () => {
  it("does nothing while the chat fits the budget", () => {
    const plan = planMemory(chat(10), null, 40_000);
    expect(plan.fold).toEqual([]);
    expect(plan.keep).toHaveLength(10);
  });

  it("folds the oldest messages and keeps a recent tail within the budget", () => {
    const history = chat(100);
    const budget = 5000;
    const plan = planMemory(history, null, budget);
    expect(plan.fold.length).toBeGreaterThan(0);
    expect(plan.fold[0].seq).toBe(1);
    expect(plan.throughSeq).toBe(plan.fold.at(-1)!.seq);
    expect(plan.keep.at(-1)!.seq).toBe(100);
    expect(plan.fold.length + plan.keep.length).toBe(100);
    const keptTokens = plan.keep.reduce((s, m) => s + estimateTokens(m.content), 0);
    expect(keptTokens).toBeLessThanOrEqual(budget * 0.6);
  });

  it("always keeps at least the last six messages verbatim", () => {
    const plan = planMemory(chat(20), null, 300);
    expect(plan.keep.length).toBeGreaterThanOrEqual(6);
  });

  it("skips messages already covered by the memory", () => {
    const history = chat(40);
    const memory = { summary: "short summary", throughSeq: 30 };
    const plan = planMemory(history, memory, 40_000);
    expect(plan.fold).toEqual([]);
    expect(plan.keep.map((m) => m.seq)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
  });
});

describe("chunkMessages", () => {
  it("splits into chunks under the token limit, preserving order", () => {
    const chunks = chunkMessages(chat(30), 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat().map((m) => m.seq)).toEqual(chat(30).map((m) => m.seq));
  });
});

describe("buildContextWindow with memory", () => {
  it("leads with the memory note, merged into the first user turn", () => {
    const { messages } = buildContextWindow(
      [
        { role: "user", content: "hello again" },
        { role: "assistant", content: "hi" },
      ],
      10_000,
      "The user's cat is called Pixel.",
    );
    expect(messages[0].role).toBe("user");
    expect(messages[0].content.startsWith(memoryNote("The user's cat is called Pixel."))).toBe(true);
    expect(messages[0].content.endsWith("hello again")).toBe(true);
  });

  it("adds a user turn for the memory when the window starts with the character", () => {
    const { messages } = buildContextWindow([{ role: "assistant", content: "hi" }, { role: "user", content: "yo" }], 10_000, "memo");
    expect(messages[0]).toEqual({ role: "user", content: memoryNote("memo") });
  });
});

describe("summarize", () => {
  it("folds chunks in order, carrying the summary forward", async () => {
    const calls: GenerateRequest[] = [];
    const provider: ChatProvider = {
      id: "fake",
      model: "fake",
      configurationProblem: () => null,
      generate: async (req) => {
        calls.push(req);
        req.onText(`summary after call ${calls.length}`);
        return { model: "fake", stopReason: "end_turn" };
      },
    };
    const out = await summarize(provider, {
      characterName: "Mira",
      userName: "Jaime",
      previous: "old memory",
      messages: chat(30),
      chunkTokens: 1000,
      signal: new AbortController().signal,
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.purpose === "summary")).toBe(true);
    expect(calls[0].messages[0].content).toContain("old memory");
    expect(calls[1].messages[0].content).toContain("summary after call 1");
    expect(calls[0].system).toContain("Jaime");
    expect(out).toBe(`summary after call ${calls.length}`);
  });
});
