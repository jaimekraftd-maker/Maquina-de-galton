import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { SEED_CHARACTERS } from "@/lib/data/seed";
import type { Character } from "@/lib/data/types";

const seed = SEED_CHARACTERS[0];
const character: Character = { ...seed, creatorId: null, creatorName: null, chatCount: 0, updatedAt: seed.createdAt };

describe("buildSystemPrompt", () => {
  it("includes the character definition and the user's name", () => {
    const prompt = buildSystemPrompt(character, "Alex");
    expect(prompt).toContain("You are Seraphine Vale");
    expect(prompt).toContain("talking with Alex");
    for (const part of [character.personality, character.background, character.scenario, character.speakingStyle]) {
      expect(prompt).toContain(part);
    }
    expect(prompt).toContain(character.traits.join(", "));
  });

  it("is deterministic so it can be prompt-cached", () => {
    expect(buildSystemPrompt(character, "Alex")).toBe(buildSystemPrompt(character, "Alex"));
  });

  it("omits empty optional sections", () => {
    const prompt = buildSystemPrompt({ ...character, scenario: "", exampleDialogue: "" }, "Alex");
    expect(prompt).not.toContain("## Scenario");
    expect(prompt).not.toContain("## Example dialogue");
  });
});
