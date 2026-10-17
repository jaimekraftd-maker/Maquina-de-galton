import "server-only";

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const config = {
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  },
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  },
  /** "supabase" when credentials are configured, otherwise the single-user local mode. */
  get dataMode(): "supabase" | "local" {
    return this.supabaseUrl && this.supabaseAnonKey ? "supabase" : "local";
  },
  get localModeAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.NOCTURNE_ALLOW_LOCAL_MODE === "true";
  },
  get localDataDir() {
    return process.env.NOCTURNE_DATA_DIR || ".data";
  },
  ai: {
    get provider() {
      return (process.env.AI_PROVIDER || "anthropic").toLowerCase();
    },
    get model() {
      return process.env.AI_MODEL || "claude-opus-5-5";
    },
    get effort(): Effort {
      const e = (process.env.AI_EFFORT || "medium").toLowerCase();
      return (EFFORTS as readonly string[]).includes(e) ? (e as Effort) : "medium";
    },
    get maxOutputTokens() {
      return int("AI_MAX_OUTPUT_TOKENS", 16000, 256, 128000);
    },
    get contextMaxTokens() {
      return int("AI_CONTEXT_MAX_TOKENS", 24000, 2000, 900000);
    },
    get timeoutMs() {
      return int("AI_TIMEOUT_MS", 120000, 5000, 600000);
    },
    get serverFallbacks() {
      return process.env.AI_SERVER_FALLBACKS !== "false";
    },
    get rateLimitPerMinute() {
      return int("AI_RATE_LIMIT_PER_MINUTE", 12, 1, 600);
    },
  },
};
