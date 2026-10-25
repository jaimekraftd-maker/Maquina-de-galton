import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, MessagesSquare, PlusCircle, Sparkles } from "lucide-react";
import { CharacterGrid } from "@/components/characters/character-card";
import { ConversationList } from "@/components/library/conversation-list";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getContext } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };

const TABS = [
  { id: "chats", label: "Conversations", icon: MessagesSquare },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "created", label: "My characters", icon: Sparkles },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const { store, viewer } = await getContext();
  if (!viewer) redirect("/login?next=/library");
  const raw = (await searchParams).tab;
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "chats";

  const [conversations, favorites, created] = await Promise.all([
    store.listConversations(viewer.id, 200),
    store.listFavorites(viewer.id),
    store.listCharactersByCreator(viewer.id),
  ]);
  const counts: Record<TabId, number> = { chats: conversations.length, favorites: favorites.length, created: created.length };

  return (
    <div className="mx-auto max-w-[96rem] space-y-6 p-[var(--space-page)] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Your space</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Library</h1>
        </div>
        <Link href="/create" className={buttonClasses("secondary")}>
          <PlusCircle className="h-4 w-4" /> New character
        </Link>
      </header>

      <nav aria-label="Library sections" className="-mx-[var(--space-page)] overflow-x-auto px-[var(--space-page)] no-scrollbar">
        <ul className="flex w-max gap-1 rounded-2xl border border-line bg-surface/60 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <Link
                href={id === "chats" ? "/library" : `/library?tab=${id}`}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors",
                  tab === id ? "bg-white/10 text-fg" : "text-muted hover:text-fg",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
                <span className="rounded-full bg-white/[0.08] px-1.5 text-xs tabular-nums text-muted">{counts[id]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "chats" ? (
        conversations.length ? (
          <div className="max-w-3xl">
            <ConversationList conversations={conversations} />
          </div>
        ) : (
          <EmptyState
            icon={<MessagesSquare className="h-6 w-6" />}
            title="No conversations yet"
            description="Find a character you like and say hello. Your chats are saved here so you can pick up where you left off."
            action={
              <Link href="/" className={buttonClasses("primary")}>
                Discover characters
              </Link>
            }
          />
        )
      ) : null}

      {tab === "favorites" ? (
        favorites.length ? (
          <CharacterGrid characters={favorites} />
        ) : (
          <EmptyState
            icon={<Heart className="h-6 w-6" />}
            title="No favorites yet"
            description="Tap the heart on a character's profile to keep them close."
            action={
              <Link href="/" className={buttonClasses("primary")}>
                Browse characters
              </Link>
            }
          />
        )
      ) : null}

      {tab === "created" ? (
        created.length ? (
          <CharacterGrid characters={created} />
        ) : (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="You haven't created any characters"
            description="Design a personality, write a greeting, and bring someone new to life."
            action={
              <Link href="/create" className={buttonClasses("primary")}>
                Create a character
              </Link>
            }
          />
        )
      ) : null}
    </div>
  );
}
