import "server-only";
import path from "node:path";
import { connection } from "next/server";
import { cache } from "react";
import { config } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOCAL_USER_ID, LOCAL_USER_NAME, LocalStore } from "./local-store";
import type { DataStore } from "./store";
import { SupabaseStore } from "./supabase-store";
import type { Viewer } from "./types";

export class ConfigurationError extends Error {}

const globalForStore = globalThis as unknown as { __nocturneLocalStore?: LocalStore };

function localStore(): LocalStore {
  if (!config.localModeAllowed) {
    throw new ConfigurationError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, " +
        "or set NOCTURNE_ALLOW_LOCAL_MODE=true to run the single-user local mode in production.",
    );
  }
  // Keep one instance across hot reloads in development.
  globalForStore.__nocturneLocalStore ??= new LocalStore(path.join(process.cwd(), config.localDataDir, "nocturne.json"));
  return globalForStore.__nocturneLocalStore;
}

export interface RequestContext {
  store: DataStore;
  viewer: Viewer | null;
  mode: "supabase" | "local";
}

/** Resolves the data store and signed-in user for the current request (memoized per request). */
export const getContext = cache(async (): Promise<RequestContext> => {
  // Everything here is per-request (session, private data): never prerender it.
  await connection();
  if (config.dataMode === "local") {
    return {
      store: localStore(),
      mode: "local",
      viewer: { id: LOCAL_USER_ID, displayName: LOCAL_USER_NAME, email: null, avatarUrl: null, isLocal: true },
    };
  }

  const sb = await createSupabaseServerClient();
  const store = new SupabaseStore(sb);
  // getClaims() verifies the JWT, unlike getSession() which trusts the cookie.
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { store, viewer: null, mode: "supabase" };

  const { data: profile } = await sb.from("profiles").select("display_name, avatar_url").eq("id", claims.sub).maybeSingle();
  const email = typeof claims.email === "string" ? claims.email : null;
  return {
    store,
    mode: "supabase",
    viewer: {
      id: claims.sub,
      displayName: profile?.display_name ?? email?.split("@")[0] ?? "Traveler",
      avatarUrl: profile?.avatar_url ?? null,
      email,
      isLocal: false,
    },
  };
});

export class UnauthorizedError extends Error {
  constructor() {
    super("You need to sign in to do that.");
    this.name = "UnauthorizedError";
  }
}

/** Like getContext but throws when nobody is signed in. */
export async function requireViewer(): Promise<RequestContext & { viewer: Viewer }> {
  const ctx = await getContext();
  if (!ctx.viewer) throw new UnauthorizedError();
  return ctx as RequestContext & { viewer: Viewer };
}
