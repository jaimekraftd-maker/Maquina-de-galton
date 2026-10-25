import { describe, expect, it } from "vitest";
import { buildContextWindow } from "@/lib/ai/context";
import { summaryPrompt } from "@/lib/ai/memory";
import { formatRecalled, keywords, recall } from "@/lib/ai/recall";
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

const older: Message[] = [
  msg(1, "Good morning, Maomao. The herbs in the garden smell strong today."),
  msg(2, "*sniffs* Foxglove. Don't touch it."),
  msg(3, "I designed a dress for you: emerald silk with silver embroidery and wide sleeves."),
  msg(4, "*turns it over* The sleeves would hide my notes. I like it."),
  msg(5, "We talked about poisons for an hour."),
  msg(6, "As one does."),
  msg(7, "And a second dress in midnight blue cotton, plain, for working."),
  msg(8, "Practical. Better than the first, honestly."),
];

describe("keywords", () => {
  it("drops stop words and folds simple plurals", () => {
    expect(keywords("Do you remember the dresses I designed?")).toEqual(["dress", "designed"]);
    expect(keywords("¿Recuerdas los vestidos que diseñé?")).toEqual(["vestido", "disene"]);
  });
});

describe("recall", () => {
  it("finds earlier messages about the same topic, with the reply after each", () => {
    const hits = recall(older, "Do you remember the dresses I made for you?", 10_000);
    expect(hits.map((m) => m.seq)).toEqual([3, 4, 7, 8]);
  });

  it("returns nothing for a message with no content words", () => {
    expect(recall(older, "ok, yes", 10_000)).toEqual([]);
  });

  it("respects the token budget, preferring the best matches", () => {
    const hits = recall(older, "emerald silk dress", 40);
    expect(hits.map((m) => m.seq)).toEqual([3]);
  });

  it("formats quotes with real names", () => {
    expect(formatRecalled([older[2], older[3]], "Jaime", "Maomao")).toBe(
      `Jaime: ${older[2].content}\n\nMaomao: ${older[3].content}`,
    );
  });
});

describe("memory with recall", () => {
  it("puts the summary and the quoted moments before the recent messages", () => {
    const { messages } = buildContextWindow([{ role: "user", content: "remember my dresses?" }], 10_000, "Summary.", "Jaime: emerald silk");
    expect(messages).toHaveLength(1);
    const text = messages[0].content;
    expect(text.indexOf("Summary.")).toBeLessThan(text.indexOf("emerald silk"));
    expect(text.indexOf("emerald silk")).toBeLessThan(text.indexOf("remember my dresses?"));
  });

  it("asks the summary to keep the user's creations in full", () => {
    const prompt = summaryPrompt("Maomao", "Jaime");
    expect(prompt).toContain("## Things Jaime made, designed, gave or described");
    expect(prompt).toMatch(/Never shorten or drop an entry/);
  });
});
