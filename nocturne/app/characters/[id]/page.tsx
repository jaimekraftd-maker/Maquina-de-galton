import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Lock, MessageCircle, MessagesSquare, ScrollText, Sparkles, UserRound } from "lucide-react";
import { FavoriteButton } from "@/components/characters/favorite-button";
import { OwnerActions } from "@/components/characters/owner-actions";
import { StartChatButton } from "@/components/characters/start-chat-button";
import { RichText } from "@/components/chat/rich-text";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getContext } from "@/lib/data";
import { categoryLabel } from "@/lib/data/types";
import { formatCount, relativeTime } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation";

async function load(id: string) {
  if (!uuidSchema.safeParse(id).success) return null;
  const ctx = await getContext();
  const character = await ctx.store.getCharacter(ctx.viewer?.id ?? null, id);
  return character ? { ...ctx, character } : null;
}

export async function generateMetadata({ params }: PageProps<"/characters/[id]">): Promise<Metadata> {
  const data = await load((await params).id);
  return data ? { title: data.character.name, description: data.character.tagline } : { title: "Character not found" };
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface/80 p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function CharacterPage({ params }: PageProps<"/characters/[id]">) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { character: c, viewer, store } = data;
  const isOwner = viewer?.id === c.creatorId;
  const [favorite, lastConversation] = viewer
    ? await Promise.all([store.isFavorite(viewer.id, c.id), store.latestConversationFor(viewer.id, c.id)])
    : [false, null];

  const definition: [string, string][] = [
    ["Personality", c.personality],
    ["Speaking style", c.speakingStyle],
    ["Scenario", c.scenario],
    ["Greeting", c.greeting],
    ["Example dialogue", c.exampleDialogue],
    ["Background", c.background],
  ];

  return (
    <div className="mx-auto max-w-6xl p-[var(--space-page)] pb-16">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:gap-8">
        {/* Portrait + primary actions */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-card">
            <div className="relative">
              <Avatar
                src={c.avatarUrl}
                name={c.name}
                priority
                rounded="rounded-none"
                className="aspect-[4/5] w-full max-lg:max-h-[28rem]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
            </div>
            <div className="-mt-16 space-y-4 p-5 pt-0 relative">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight">{c.name}</h1>
                <p className="mt-1 text-[15px] text-fg/80">{c.tagline}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" /> {c.creatorName ? `by ${c.creatorName}` : "Nocturne original"}
                </span>
                {c.chatCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" /> {formatCount(c.chatCount)} chat{c.chatCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {c.visibility === "private" ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <Lock className="h-3.5 w-3.5" /> Private
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <StartChatButton characterId={c.id} size="lg" className="flex-1" label={lastConversation ? "New chat" : "Start chat"} />
                <FavoriteButton characterId={c.id} initial={favorite} signedIn={!!viewer} className="h-12 w-12" />
              </div>
              {lastConversation ? (
                <Link href={`/chat/${lastConversation.id}`} className={buttonClasses("secondary", "md", "w-full")}>
                  <MessagesSquare className="h-4 w-4" /> Continue last chat · {relativeTime(lastConversation.lastActivityAt)}
                </Link>
              ) : null}
              {isOwner ? (
                <div className="flex gap-2 border-t border-line pt-4 [&>a]:flex-1">
                  <OwnerActions characterId={c.id} name={c.name} />
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Details */}
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {c.categories.map((cat) => (
              <Link key={cat} href={`/?category=${cat}`}>
                <Badge tone="accent">{categoryLabel(cat)}</Badge>
              </Link>
            ))}
            {c.tags.map((t) => (
              <Link key={t} href={`/search?q=${encodeURIComponent(t)}`}>
                <Badge>#{t}</Badge>
              </Link>
            ))}
          </div>

          <Block icon={<BookOpen className="h-4 w-4" />} title="About">
            <p className="leading-relaxed whitespace-pre-line text-fg/85">{c.description}</p>
          </Block>

          <Block icon={<Sparkles className="h-4 w-4" />} title="Personality">
            {c.traits.length ? (
              <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Traits">
                {c.traits.map((t) => (
                  <li key={t}>
                    <Badge tone="rose">{t}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="leading-relaxed whitespace-pre-line text-fg/85">{c.personality}</p>
          </Block>

          {c.scenario ? (
            <Block icon={<ScrollText className="h-4 w-4" />} title="Scenario">
              <p className="leading-relaxed whitespace-pre-line text-fg/85">{c.scenario}</p>
            </Block>
          ) : null}

          <Block icon={<MessageCircle className="h-4 w-4" />} title="Greeting">
            <div className="flex gap-3">
              <Avatar src={c.avatarUrl} name={c.name} className="h-9 w-9" />
              <div className="rounded-bubble rounded-tl-md border border-line bg-surface-2 px-4 py-3 text-[15px] leading-relaxed">
                <RichText text={c.greeting} />
              </div>
            </div>
          </Block>

          {c.background ? (
            <Block icon={<BookOpen className="h-4 w-4" />} title="Background">
              <p className="leading-relaxed whitespace-pre-line text-fg/85">{c.background}</p>
            </Block>
          ) : null}

          <details className="group rounded-card border border-line bg-surface/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-card px-5 py-4 font-medium hover:bg-white/[0.02] sm:px-6">
              <span className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-accent" /> Full character definition
              </span>
              <span className="text-sm text-muted group-open:hidden">Show</span>
              <span className="hidden text-sm text-muted group-open:inline">Hide</span>
            </summary>
            <dl className="space-y-4 border-t border-line px-5 py-5 sm:px-6">
              {definition
                .filter(([, v]) => v.trim())
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold tracking-wider text-subtle uppercase">{label}</dt>
                    <dd className="mt-1 text-sm leading-relaxed whitespace-pre-line text-fg/80">{value}</dd>
                  </div>
                ))}
            </dl>
          </details>
        </div>
      </div>
    </div>
  );
}
