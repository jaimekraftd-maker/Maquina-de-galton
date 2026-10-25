import Link from "next/link";
import { CATEGORIES, type CategoryId } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/** Horizontally scrollable category filter. `basePath` keeps other params (e.g. q, sort). */
export function CategoryChips({
  active,
  basePath,
  params = {},
}: {
  active?: CategoryId;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (category?: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, category })) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const chip = (label: string, isActive: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
      isActive
        ? "border-accent/50 bg-accent-soft text-fg"
        : "border-line bg-white/[0.03] text-muted hover:border-line-strong hover:text-fg",
    );

  return (
    <nav aria-label="Categories" className="-mx-[var(--space-page)] overflow-x-auto px-[var(--space-page)] no-scrollbar">
      <ul className="flex w-max gap-2 pb-1">
        <li>
          <Link href={href(undefined)} className={chip("All", !active)} aria-current={!active ? "true" : undefined} scroll={false}>
            All
          </Link>
        </li>
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <Link
              href={href(active === c.id ? undefined : c.id)}
              className={chip(c.label, active === c.id)}
              aria-current={active === c.id ? "true" : undefined}
              scroll={false}
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
