import { CATEGORY_IDS, SORT_OPTIONS, type CategoryId, type SortId } from "@/lib/data/types";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseCharacterParams(sp: Params) {
  const rawCategory = first(sp.category);
  const rawSort = first(sp.sort);
  const q = (first(sp.q) ?? "").slice(0, 100);
  const category = (CATEGORY_IDS as readonly string[]).includes(rawCategory ?? "") ? (rawCategory as CategoryId) : undefined;
  const sort = SORT_OPTIONS.some((o) => o.id === rawSort) ? (rawSort as SortId) : undefined;
  return { q, category, sort };
}
