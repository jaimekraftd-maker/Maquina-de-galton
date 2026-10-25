"use client";

import { Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Live search: updates the URL (debounced) so results are server-rendered and shareable. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const push = (q: string) => {
    const sp = new URLSearchParams(params.toString());
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    if (!q.trim() && sp.get("sort") === null) sp.delete("sort");
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        push(value);
      }}
    >
      <label htmlFor="search-page-input" className="sr-only">
        Search characters
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        id="search-page-input"
        type="search"
        autoFocus
        value={value}
        maxLength={100}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => push(e.target.value), 300);
        }}
        placeholder="Search by name, description, tag or category"
        className="h-14 w-full rounded-2xl border border-line-strong bg-surface-2/80 pr-12 pl-12 text-base text-fg placeholder:text-subtle focus:border-accent/60 focus:ring-2 focus:ring-accent/25 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute top-1/2 right-4 -translate-y-1/2">
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Searching" />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              push("");
            }}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-fg"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </span>
    </form>
  );
}
