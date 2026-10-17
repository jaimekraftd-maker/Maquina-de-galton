import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { CategoryChips } from "@/components/characters/category-chips";
import { CharacterGrid, CharacterGridSkeleton } from "@/components/characters/character-card";
import { SearchBox } from "@/components/characters/search-box";
import { SortSelect } from "@/components/characters/sort-select";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getContext } from "@/lib/data";
import { categoryLabel, type CategoryId, type SortId } from "@/lib/data/types";
import { parseCharacterParams } from "@/lib/params";

export const metadata: Metadata = { title: "Search" };

async function Results({ q, category, sort }: { q: string; category?: CategoryId; sort?: SortId }) {
  const { store, viewer } = await getContext();
  const results = await store.searchCharacters(viewer?.id ?? null, { q, category, sort, limit: 60 });
  if (!results.length) {
    return (
      <EmptyState
        icon={<SearchX className="h-6 w-6" />}
        title={q ? `No characters match “${q}”` : "No characters found"}
        description={
          category
            ? `Try another keyword, or search outside the ${categoryLabel(category)} category.`
            : "Try a different keyword, a tag like “cozy”, or browse by category."
        }
        action={
          <Link href="/create" className={buttonClasses("secondary")}>
            Create this character yourself
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" aria-live="polite">
        {results.length} character{results.length === 1 ? "" : "s"}
        {q ? ` for “${q}”` : ""}
        {category ? ` in ${categoryLabel(category)}` : ""}
      </p>
      <CharacterGrid characters={results} priorityCount={4} />
    </div>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q, category, sort } = parseCharacterParams(await searchParams);
  return (
    <div className="mx-auto max-w-[96rem] space-y-5 p-[var(--space-page)] pb-16">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Search</h1>
      <SearchBox initial={q} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CategoryChips active={category} basePath="/search" params={{ q: q || undefined, sort }} />
        </div>
        <SortSelect value={sort ?? (q ? "relevance" : "popular")} />
      </div>
      <Suspense key={`${q}|${category}|${sort}`} fallback={<CharacterGridSkeleton />}>
        <Results q={q} category={category} sort={sort} />
      </Suspense>
    </div>
  );
}
