import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="flex h-16 items-center gap-3 border-b border-line px-5">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[var(--measure-chat)] flex-1 space-y-5 px-4 py-6">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-24 w-3/4 rounded-bubble" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-12 w-1/2 rounded-bubble" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-20 w-2/3 rounded-bubble" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[var(--measure-chat)] px-4 pb-4">
        <Skeleton className="h-14 w-full rounded-[1.4rem]" />
      </div>
    </div>
  );
}
