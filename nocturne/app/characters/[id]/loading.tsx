import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl p-[var(--space-page)]" aria-busy="true" aria-label="Loading character">
      <Skeleton className="mb-5 h-4 w-24" />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:gap-8">
        <Skeleton className="aspect-[4/5] w-full rounded-[1.75rem]" />
        <div className="space-y-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-36 w-full rounded-card" />
          <Skeleton className="h-36 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}
