import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { unstable_rethrow } from "next/navigation";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { MotionProvider } from "@/components/layout/motion-provider";
import { getContext } from "@/lib/data";
import "./globals.css";

const body = Manrope({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Sora({ subsets: ["latin"], variable: "--font-heading", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nocturne — chat with characters", template: "%s · Nocturne" },
  description: "Discover, create and chat with original AI characters.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0a0910",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let shellProps: React.ComponentProps<typeof AppShell>["data"];
  try {
    const { store, viewer, mode } = await getContext();
    const recent = viewer ? await store.listConversations(viewer.id, 12) : [];
    shellProps = {
      viewer,
      mode,
      recent: recent.map((c) => ({
        id: c.id,
        title: c.title,
        pinned: c.pinned,
        characterName: c.character?.name ?? "Unavailable character",
        avatarUrl: c.character?.avatarUrl ?? null,
      })),
    };
  } catch (err) {
    unstable_rethrow(err); // let Next.js handle its own control-flow errors
    console.error("[layout] failed to load session:", err);
    shellProps = { viewer: null, mode: "local", recent: [], error: err instanceof Error ? err.message : "Configuration error" };
  }

  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body>
        <MotionProvider>
          <AppShell data={shellProps}>{children}</AppShell>
        </MotionProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: "#191623", border: "1px solid rgb(255 255 255 / 0.12)", color: "#ece8f5" },
          }}
        />
      </body>
    </html>
  );
}
