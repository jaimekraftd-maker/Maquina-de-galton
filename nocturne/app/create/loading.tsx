import { CharacterGridSkeleton } from "@/components/characters/character-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] space-y-6 p-[var(--space-page)]" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-full max-w-xl rounded-2xl" />
      <CharacterGridSkeleton count={8} />
    </div>
  );
}
