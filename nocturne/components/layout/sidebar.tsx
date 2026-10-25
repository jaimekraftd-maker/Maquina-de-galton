"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Library, LogIn, MessageCircle, PanelLeftClose, PanelLeftOpen, Pin, PlusCircle, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import type { ShellData } from "./types";

const NAV = [
  { href: "/", label: "Discover", icon: Compass, match: (p: string) => p === "/" },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/create", label: "Create", icon: PlusCircle, match: (p: string) => p.startsWith("/create") },
  { href: "/library", label: "Library", icon: Library, match: (p: string) => p.startsWith("/library") },
];

export function SidebarContent({
  data,
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  data: ShellData;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? <Logo /> : null}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-fg"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        ) : null}
      </div>

      <nav aria-label="Main" className="px-3">
        <ul className="space-y-1">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    active ? "bg-accent-soft text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-accent")} />
                  {!collapsed ? label : <span className="sr-only">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {data.viewer ? (
          <>
            {!collapsed ? (
              <div className="mb-2 flex items-center justify-between px-3">
                <h2 className="text-xs font-semibold tracking-wider text-subtle uppercase">Recent chats</h2>
                {data.recent.length ? (
                  <Link href="/library" onClick={onNavigate} className="text-xs text-muted hover:text-fg">
                    View all
                  </Link>
                ) : null}
              </div>
            ) : null}
            {data.recent.length === 0 && !collapsed ? (
              <p className="px-3 text-sm text-subtle">Your conversations will appear here.</p>
            ) : (
              <ul className="space-y-0.5">
                {data.recent.map((chat) => {
                  const active = pathname === `/chat/${chat.id}`;
                  return (
                    <li key={chat.id}>
                      <Link
                        href={`/chat/${chat.id}`}
                        onClick={onNavigate}
                        title={collapsed ? `${chat.characterName}: ${chat.title}` : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors",
                          collapsed && "justify-center",
                          active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                        )}
                      >
                        <Avatar src={chat.avatarUrl} name={chat.characterName} className="h-8 w-8" />
                        {!collapsed ? (
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 truncate text-sm font-medium text-fg">
                              <span className="truncate">{chat.characterName}</span>
                              {chat.pinned ? <Pin className="h-3 w-3 shrink-0 text-accent" aria-label="Pinned" /> : null}
                            </span>
                            <span className="block truncate text-xs text-subtle">{chat.title}</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : !collapsed ? (
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <MessageCircle className="mb-2 h-5 w-5 text-accent" />
            <p className="text-sm font-medium">Save your conversations</p>
            <p className="mt-1 text-xs text-muted">Sign in to chat, keep favorites and create characters.</p>
            <Link
              href="/login"
              onClick={onNavigate}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-soft px-3 text-sm font-medium text-fg hover:bg-accent/25"
            >
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
