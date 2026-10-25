import Link from "next/link";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { buttonClasses } from "@/components/ui/button";
import { getContext } from "@/lib/data";
import { AuthForm } from "./auth-form";

function safeNext(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function AuthPage({
  mode,
  searchParams,
}: {
  mode: "login" | "signup";
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { viewer, mode: dataMode } = await getContext();
  const next = safeNext(searchParams.next);
  if (viewer && !viewer.isLocal) redirect(next);

  return (
    <div className="grid min-h-full place-items-center p-[var(--space-page)]">
      <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-surface/90 p-6 shadow-card sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="mb-4 h-12 w-12" />
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login" ? "Sign in to continue your conversations." : "Save chats, favorites and your own characters."}
          </p>
        </div>
        {dataMode === "local" ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-2xl border border-warning/25 bg-warning/[0.07] p-4 text-sm">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <p className="text-fg/85">
                Accounts are disabled because Supabase isn&apos;t configured. You&apos;re using the single-user local development mode,
                where everything is stored on this machine. See the README to enable sign-up and sign-in.
              </p>
            </div>
            <Link href={next} className={buttonClasses("primary", "lg", "w-full")}>
              Continue in local mode
            </Link>
          </div>
        ) : (
          <>
            {searchParams.error === "confirmation" ? (
              <p role="alert" className="mb-4 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
                That confirmation link is invalid or expired. Try signing in, or sign up again.
              </p>
            ) : null}
            <AuthForm mode={mode} next={next} />
          </>
        )}
      </div>
    </div>
  );
}
