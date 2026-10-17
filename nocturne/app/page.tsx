import Link from "next/link";
import { Compass, MessageCircle } from "lucide-react";
import { CategoryChips } from "@/components/characters/category-chips";
import { CharacterGrid, CharacterRow } from "@/components/characters/character-card";
import { FeaturedHero } from "@/components/characters/featured-hero";
import { Section } from "@/components/characters/section";
import { SortSelect } from "@/components/characters/sort-select";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getContext } from "@/lib/data";
import { categoryLabel, type CategoryId, type CharacterSummary } from "@/lib/data/types";
import { parseCharacterParams } from "@/lib/params";
import { previewText, relativeTime } from "@/lib/utils";

export default async function DiscoverPage({ searchParams }: PageProps<"/">) {
  const { category, sort } = parseCharacterParams(await searchParams);
  const { store, viewer } = await getContext();

  // Filtered view: a single grid.
  if (category || sort) {
    const results = await store.searchCharacters(viewer?.id ?? null, { category, sort: sort ?? "popular", limit: 60 });
    return (
      <div className="mx-auto max-w-[96rem] space-y-6 p-[var(--space-page)]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Discover</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {category ? categoryLabel(category) : "All characters"}
            </h1>
          </div>
          <SortSelect value={sort ?? "popular"} />
        </header>
        <CategoryChips active={category} basePath="/" params={{ sort }} />
        {results.length ? (
          <CharacterGrid characters={results} priorityCount={4} />
        ) : (
          <EmptyState
            icon={<Compass className="h-6 w-6" />}
            title="No characters here yet"
            description="Nobody has published a character in this category. Be the first!"
            action={
              <Link href="/create" className={buttonClasses("primary")}>
                Create a character
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const [all, recentlyAdded, favorites, conversations] = await Promise.all([
    store.searchCharacters(viewer?.id ?? null, { sort: "popular", limit: 100 }),
    store.searchCharacters(viewer?.id ?? null, { sort: "new", limit: 10 }),
    viewer ? store.listFavorites(viewer.id) : Promise.resolve([] as CharacterSummary[]),
    viewer ? store.listConversations(viewer.id, 4) : Promise.resolve([]),
  ]);

  const featuredIds = all.filter((c) => c.featured).map((c) => c.id);
  const featured = (
    await Promise.all(featuredIds.slice(0, 5).map((id) => store.getCharacter(viewer?.id ?? null, id)))
  ).filter((c) => c !== null);
  const trending = all.filter((c) => c.visibility === "public").slice(0, 10);
  const recommended = recommend(all, favorites, conversations.map((c) => c.characterId));

  return (
    <div className="mx-auto max-w-[96rem] space-y-10 p-[var(--space-page)] pb-16">
      <FeaturedHero
        items={featured.map((c) => ({
          id: c.id,
          name: c.name,
          tagline: c.tagline,
          description: c.description,
          avatarUrl: c.avatarUrl,
          categories: c.categories,
          tags: c.tags,
        }))}
      />

      <CategoryChips basePath="/" />

      {conversations.length ? (
        <Section title="Continue chatting" href="/library">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-accent/30 hover:bg-surface-2"
                >
                  <Avatar src={c.character?.avatarUrl} name={c.character?.name ?? "?"} className="h-12 w-12" rounded="rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.character?.name ?? "Unavailable character"}</span>
                    <span className="block truncate text-xs text-muted">{c.lastMessagePreview ? previewText(c.lastMessagePreview) : c.title}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-subtle">{relativeTime(c.lastActivityAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Trending" subtitle="Ranked by conversations started on Nocturne" href="/?sort=popular">
        {trending.length ? <CharacterRow characters={trending} priorityCount={5} /> : null}
      </Section>

      <Section
        title={recommended.personalized ? "Recommended for you" : "Recommended"}
        subtitle={
          recommended.personalized
            ? `Because you like ${recommended.basis.map(categoryLabel).join(" & ")}`
            : "A hand-picked mix to start with"
        }
      >
        <CharacterRow characters={recommended.items} />
      </Section>

      <Section title="Recently added" subtitle="Fresh characters from the community" href="/?sort=new">
        <CharacterRow characters={recentlyAdded} />
      </Section>

      {!viewer ? (
        <div className="flex flex-col items-start gap-4 rounded-card border border-line bg-gradient-to-br from-accent/15 to-rose/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-6 w-6 text-accent" />
            <p className="text-sm text-fg/90">Sign in to start conversations, save favorites and create your own characters.</p>
          </div>
          <Link href="/login" className={buttonClasses("primary")}>
            Sign in
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Simple content-based recommendations from the categories a user already enjoys. */
function recommend(all: CharacterSummary[], favorites: CharacterSummary[], chattedIds: string[]) {
  const weights = new Map<CategoryId, number>();
  const seen = new Set([...favorites.map((f) => f.id), ...chattedIds]);
  const liked = [...favorites, ...all.filter((c) => chattedIds.includes(c.id))];
  for (const c of liked) for (const cat of c.categories) weights.set(cat, (weights.get(cat) ?? 0) + 1);

  const publicChars = all.filter((c) => c.visibility === "public");
  if (weights.size === 0) {
    const picks = publicChars.filter((c) => !c.featured).slice(0, 8);
    return { personalized: false, basis: [] as CategoryId[], items: picks.length ? picks : publicChars.slice(0, 8) };
  }
  const scored = publicChars
    .filter((c) => !seen.has(c.id))
    .map((c) => ({ c, score: c.categories.reduce((s, cat) => s + (weights.get(cat) ?? 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.c.chatCount - a.c.chatCount);
  const basis = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  const items = scored.slice(0, 8).map((x) => x.c);
  return items.length
    ? { personalized: true, basis, items }
    : { personalized: false, basis: [] as CategoryId[], items: publicChars.filter((c) => !seen.has(c.id)).slice(0, 8) };
}
