import { CharacterGridSkeleton } from "@/components/characters/character-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] space-y-8 p-[var(--space-page)]" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-72 w-full rounded-[1.75rem]" />
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <CharacterGridSkeleton count={5} />
    </div>
  );
}
