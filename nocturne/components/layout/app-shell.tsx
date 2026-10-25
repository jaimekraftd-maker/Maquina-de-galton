"use client";

import * as RD from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useVisualViewportHeight } from "@/hooks/use-visual-viewport";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellData } from "./types";

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebar, setSidebar] = useLocalStorage<"open" | "collapsed">("nocturne:sidebar", "open");
  const [banner, setBanner] = useLocalStorage<"show" | "hidden">("nocturne:local-banner", "show");
  const [drawerOpen, setDrawerOpen] = useState(false);
  useVisualViewportHeight();
  const collapsed = sidebar === "collapsed";
  const inChat = pathname.startsWith("/chat/");

  return (
    <div className="flex h-[var(--app-height,100dvh)] overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "hidden shrink-0 border-r border-line bg-surface/60 transition-[width] duration-300 ease-out-soft lg:block",
          collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-width)]",
        )}
      >
        <SidebarContent data={data} collapsed={collapsed} onToggle={() => setSidebar(collapsed ? "open" : "collapsed")} />
      </aside>

      <RD.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" />
          <RD.Content className="fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] border-r border-line bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-card focus:outline-none lg:hidden">
            <RD.Title className="sr-only">Navigation</RD.Title>
            <RD.Description className="sr-only">Main navigation and recent chats</RD.Description>
            <SidebarContent data={data} onNavigate={() => setDrawerOpen(false)} />
            <RD.Close
              className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-3 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-fg"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </RD.Close>
          </RD.Content>
        </RD.Portal>
      </RD.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {data.error ? (
          <div role="alert" className="flex items-start gap-2 border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{data.error}</span>
          </div>
        ) : data.mode === "local" && banner === "show" && !inChat ? (
          <div className="flex items-start gap-2 border-b border-warning/20 bg-warning/[0.07] px-4 py-2 text-xs text-warning sm:text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1">
              <strong className="font-semibold">Local development mode.</strong> There is no sign-in, and everything is saved to{" "}
              <code className="rounded bg-black/30 px-1">.data/</code> on this machine for a single local user. Configure Supabase to
              enable accounts.
            </p>
            <button
              type="button"
              onClick={() => setBanner("hidden")}
              className="rounded p-0.5 hover:bg-white/10"
              aria-label="Dismiss local mode notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <Suspense fallback={<div className="h-16 border-b border-line" />}>
          <Topbar data={data} onOpenMenu={() => setDrawerOpen(true)} className={inChat ? "hidden lg:flex" : undefined} />
        </Suspense>

        <main id="main" tabIndex={-1} className={cn("min-h-0 flex-1 focus:outline-none", inChat ? "overflow-hidden" : "overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]")}>
          {children}
        </main>
      </div>
    </div>
  );
}
