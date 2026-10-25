import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#1a1626" />
      <path d="M40 14a20 20 0 1 0 10 34A16 16 0 1 1 40 14z" fill="#d9c6ff" />
      <circle cx="46" cy="20" r="2.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Nocturne home">
      <LogoMark />
      {!collapsed ? <span className="font-display text-lg font-semibold tracking-tight">Nocturne</span> : null}
    </Link>
  );
}
