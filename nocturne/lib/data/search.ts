import { categoryLabel, type Character, type CharacterQuery, type CharacterSummary } from "./types";

export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function tokenize(q: string | undefined): string[] {
  if (!q) return [];
  return normalize(q)
    .split(/\s+/)
    .map((t) => t.replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function haystack(c: Character): string {
  return normalize(
    [c.name, c.tagline, c.description, c.tags.join(" "), c.categories.map(categoryLabel).join(" "), c.categories.join(" ")].join(
      " \u0000 ",
    ),
  );
}

/** Relevance score; 0 means "does not match". Every token must appear somewhere. */
export function scoreCharacter(c: Character, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const hay = haystack(c);
  const name = normalize(c.name);
  const tags = c.tags.map(normalize);
  let score = 0;
  for (const t of tokens) {
    if (!hay.includes(t)) return 0;
    if (name.startsWith(t)) score += 6;
    else if (name.includes(t)) score += 4;
    if (tags.some((tag) => tag === t)) score += 3;
    score += 1;
  }
  return score;
}

export function toSummary(c: Character): CharacterSummary {
  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    avatarUrl: c.avatarUrl,
    tags: c.tags,
    categories: c.categories,
    chatCount: c.chatCount,
    creatorId: c.creatorId,
    creatorName: c.creatorName,
    visibility: c.visibility,
    featured: c.featured,
    createdAt: c.createdAt,
  };
}

/** Pure in-memory implementation of character search, used by the local store. */
export function searchInMemory(characters: Character[], query: CharacterQuery): CharacterSummary[] {
  const tokens = tokenize(query.q);
  const scored = characters
    .filter((c) => !query.category || c.categories.includes(query.category))
    .map((c) => ({ c, score: scoreCharacter(c, tokens) }))
    .filter((x) => x.score > 0);

  const sort = query.sort ?? (tokens.length ? undefined : "popular");
  scored.sort((a, b) => {
    if (!sort && b.score !== a.score) return b.score - a.score;
    switch (sort) {
      case "new":
        return b.c.createdAt.localeCompare(a.c.createdAt);
      case "name":
        return a.c.name.localeCompare(b.c.name);
      default:
        return (
          b.c.chatCount - a.c.chatCount ||
          Number(b.c.featured) - Number(a.c.featured) ||
          b.c.createdAt.localeCompare(a.c.createdAt)
        );
    }
  });

  return scored.slice(0, query.limit ?? 60).map((x) => toSummary(x.c));
}
