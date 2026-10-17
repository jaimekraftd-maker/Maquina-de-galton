import { describe, expect, it } from "vitest";
import { searchInMemory } from "@/lib/data/search";
import { SEED_CHARACTERS } from "@/lib/data/seed";
import type { Character } from "@/lib/data/types";

const chars: Character[] = SEED_CHARACTERS.map((s, i) => ({
  ...s,
  creatorId: null,
  creatorName: null,
  chatCount: i === 3 ? 50 : i,
  updatedAt: s.createdAt,
}));

describe("searchInMemory", () => {
  it("matches names, descriptions, tags and categories (accent-insensitive)", () => {
    expect(searchInMemory(chars, { q: "kaito renjo" })[0].name).toBe("Kaito Renjō");
    expect(searchInMemory(chars, { q: "barista" }).map((c) => c.name)).toContain("Mira Hoshizora");
    expect(searchInMemory(chars, { q: "#yokai" }).map((c) => c.name)).toEqual(["Noa Kirisame"]);
    expect(searchInMemory(chars, { q: "friendly chat" }).length).toBeGreaterThan(0);
  });

  it("requires every term to match", () => {
    expect(searchInMemory(chars, { q: "dreams cyberpunk" })).toEqual([]);
  });

  it("filters by category and sorts", () => {
    const mystery = searchInMemory(chars, { category: "mystery" });
    expect(mystery.every((c) => c.categories.includes("mystery"))).toBe(true);
    expect(searchInMemory(chars, { sort: "popular" })[0].name).toBe("Lucien Ashgrave");
    expect(searchInMemory(chars, { sort: "new" })[0].name).toBe("The Lantern Keeper");
    const byName = searchInMemory(chars, { sort: "name" }).map((c) => c.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
  });

  it("ranks name matches first for relevance", () => {
    expect(searchInMemory(chars, { q: "sable" })[0].name).toBe("Sable");
  });
});
