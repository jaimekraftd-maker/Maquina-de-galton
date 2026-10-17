"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { credentialsSchema, fieldErrors, signUpSchema } from "@/lib/validation";

export interface AuthState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Only allow same-site relative redirects after sign-in. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

function requireSupabase(): AuthState | null {
  return config.dataMode === "supabase"
    ? null
    : { error: "Authentication isn't configured. The app is running in local mode (see README)." };
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const missing = requireSupabase();
  if (missing) return missing;
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error:
        error.code === "email_not_confirmed"
          ? "Please confirm your email address first — check your inbox."
          : "Incorrect email or password.",
    };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const missing = requireSupabase();
  if (missing) return missing;
  const parsed = signUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    displayName: form.get("displayName"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
    },
  });
  if (error) {
    return { error: error.code === "user_already_exists" ? "An account with this email already exists." : error.message };
  }
  if (!data.session) {
    return { message: "Check your email to confirm your account, then sign in." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  if (config.dataMode === "supabase") {
    const sb = await createSupabaseServerClient();
    await sb.auth.signOut();
  }
  redirect("/");
}
