import Link from "next/link";
import { Lock, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { categoryLabel, type CharacterSummary } from "@/lib/data/types";
import { cn, formatCount } from "@/lib/utils";

export function CharacterCard({ character, priority = false }: { character: CharacterSummary; priority?: boolean }) {
  const chips = character.tags.length ? character.tags.slice(0, 2) : character.categories.slice(0, 2).map(categoryLabel);
  return (
    <Link
      href={`/characters/${character.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card",
        "transition-[transform,box-shadow,border-color] duration-300 ease-out-soft",
        "hover:-translate-y-1 hover:border-accent/35 hover:shadow-glow focus-visible:-translate-y-1",
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <Avatar
          src={character.avatarUrl}
          name={character.name}
          rounded="rounded-none"
          priority={priority}
          className="h-full w-full transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0910] via-[#0a0910]/30 to-transparent" />
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {character.visibility === "private" ? (
            <span className="glass inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted">
              <Lock className="h-3 w-3" /> Private
            </span>
          ) : null}
          {character.chatCount > 0 ? (
            <span
              className="glass inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-fg/90"
              title={`${character.chatCount} conversation${character.chatCount === 1 ? "" : "s"} started`}
            >
              <MessageCircle className="h-3 w-3" /> {formatCount(character.chatCount)}
            </span>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <h3 className="truncate font-display text-base font-semibold text-white sm:text-[17px]">{character.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70 sm:text-[13px]">{character.tagline}</p>
        </div>
      </div>
      <div className="flex min-h-10 items-center gap-1.5 overflow-hidden px-3.5 pt-0.5 pb-3">
        {chips.map((t) => (
          <span key={t} className="max-w-[60%] shrink-0 truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted">
            #{t}
          </span>
        ))}
        {character.creatorName ? (
          <span className="ml-auto truncate text-[11px] text-subtle">by {character.creatorName}</span>
        ) : null}
      </div>
    </Link>
  );
}

export function CharacterGrid({ characters, priorityCount = 0 }: { characters: CharacterSummary[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
      {characters.map((c, i) => (
        <li key={c.id}>
          <CharacterCard character={c} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function CharacterGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5" aria-label="Loading characters">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="skeleton aspect-[4/5]" />
          <div className="flex gap-1.5 p-3.5">
            <div className="skeleton h-4 w-14 rounded-full" />
            <div className="skeleton h-4 w-10 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Single horizontally scrollable row (used for discovery sections). */
export function CharacterRow({ characters, priorityCount = 0 }: { characters: CharacterSummary[]; priorityCount?: number }) {
  return (
    <div className="-mx-[var(--space-page)] overflow-x-auto px-[var(--space-page)] pb-2 no-scrollbar">
      <ul className="flex w-max snap-x snap-mandatory gap-3 sm:gap-4">
        {characters.map((c, i) => (
          <li key={c.id} className="w-[44vw] max-w-56 min-w-40 snap-start sm:w-52">
            <CharacterCard character={c} priority={i < priorityCount} />
          </li>
        ))}
      </ul>
    </div>
  );
}
