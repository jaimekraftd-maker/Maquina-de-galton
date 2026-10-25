"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BookHeart, LogIn, LogOut, Menu, Plus, Search } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";
import type { ShellData } from "./types";

export function Topbar({ data, onOpenMenu, className }: { data: ShellData; onOpenMenu: () => void; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(pathname === "/search" ? (params.get("q") ?? "") : "");

  return (
    <header
      className={cn(
        "glass sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenMenu}
        className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-fg lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/" className="lg:hidden" aria-label="Nocturne home">
        <LogoMark className="h-8 w-8" />
      </Link>

      <form
        role="search"
        className="relative max-w-xl flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const query = q.trim();
          router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <label htmlFor="global-search" className="sr-only">
          Search characters
        </label>
        <input
          id="global-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search characters, tags, worlds…"
          className="h-10 w-full rounded-full border border-line bg-white/[0.04] pr-4 pl-10 text-sm text-fg placeholder:text-subtle hover:border-line-strong focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden sm:contents">
          <Link href="/create" className={buttonClasses("primary", "md")}>
            <Plus className="h-4 w-4" /> Create
          </Link>
        </span>
        {data.viewer ? (
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                className="rounded-full ring-offset-2 ring-offset-ink hover:ring-2 hover:ring-line-strong"
                aria-label="Account menu"
              >
                <Avatar src={data.viewer.avatarUrl} name={data.viewer.displayName} className="h-9 w-9" />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownLabel>
                <span className="block text-sm font-medium text-fg">{data.viewer.displayName}</span>
                <span className="block truncate">{data.viewer.isLocal ? "Local development user" : data.viewer.email}</span>
              </DropdownLabel>
              <DropdownSeparator />
              <DropdownItem onSelect={() => router.push("/library")}>
                <BookHeart className="h-4 w-4" /> Library
              </DropdownItem>
              <DropdownItem onSelect={() => router.push("/create")}>
                <Plus className="h-4 w-4" /> Create character
              </DropdownItem>
              {!data.viewer.isLocal ? (
                <>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => void signOut()}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownItem>
                </>
              ) : null}
            </DropdownContent>
          </Dropdown>
        ) : (
          <Button asChild variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
