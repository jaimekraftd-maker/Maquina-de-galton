import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CharacterStudio, EMPTY_CHARACTER } from "@/components/studio/character-studio";
import { getContext } from "@/lib/data";

export const metadata: Metadata = { title: "Create a character" };

export default async function CreatePage() {
  const { viewer } = await getContext();
  if (!viewer) redirect("/login?next=/create");
  return (
    <div className="mx-auto max-w-7xl p-[var(--space-page)] pb-10">
      <header className="mb-6">
        <p className="text-sm text-muted">Character studio</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Create a character</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Give them a voice, a story and a first line. Required fields are marked with <span className="text-rose">*</span>.
        </p>
      </header>
      <CharacterStudio characterId={null} initial={EMPTY_CHARACTER} />
    </div>
  );
}
