import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CharacterStudio } from "@/components/studio/character-studio";
import { getContext } from "@/lib/data";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Edit character" };

export default async function EditCharacterPage({ params }: PageProps<"/characters/[id]/edit">) {
  const { id } = await params;
  const { store, viewer } = await getContext();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/characters/${id}/edit`)}`);
  if (!uuidSchema.safeParse(id).success) notFound();
  const c = await store.getCharacter(viewer.id, id);
  if (!c || c.creatorId !== viewer.id) notFound();

  return (
    <div className="mx-auto max-w-7xl p-[var(--space-page)] pb-10">
      <Link href={`/characters/${c.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>
      <header className="mb-6">
        <p className="text-sm text-muted">Character studio</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Edit {c.name}</h1>
      </header>
      <CharacterStudio
        characterId={c.id}
        initial={{
          name: c.name,
          tagline: c.tagline,
          description: c.description,
          personality: c.personality,
          traits: c.traits,
          background: c.background,
          greeting: c.greeting,
          scenario: c.scenario,
          exampleDialogue: c.exampleDialogue,
          speakingStyle: c.speakingStyle,
          tags: c.tags,
          categories: c.categories,
          avatarUrl: c.avatarUrl,
          visibility: c.visibility,
        }}
      />
    </div>
  );
}
