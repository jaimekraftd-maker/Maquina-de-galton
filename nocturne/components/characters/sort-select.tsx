"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SORT_OPTIONS, type SortId } from "@/lib/data/types";

export function SortSelect({ value }: { value: SortId | "relevance" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const hasQuery = Boolean(params.get("q"));

  return (
    <div className="relative">
      <label htmlFor="sort" className="sr-only">
        Sort characters
      </label>
      <select
        id="sort"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const sp = new URLSearchParams(params.toString());
          if (e.target.value === "relevance") sp.delete("sort");
          else sp.set("sort", e.target.value);
          startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
        }}
        className="h-9 cursor-pointer appearance-none rounded-full border border-line bg-white/[0.03] pr-9 pl-4 text-sm text-fg hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
      >
        {hasQuery ? <option value="relevance">Best match</option> : null}
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  );
}
