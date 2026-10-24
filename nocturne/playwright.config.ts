import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const FAKE_PORT = 4010;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node e2e/fake-anthropic.mjs`,
      env: { FAKE_ANTHROPIC_PORT: String(FAKE_PORT) },
      port: FAKE_PORT,
      reuseExistingServer: false,
    },
    {
      // Local mode (no Supabase) with a throwaway data dir; AI goes through the
      // real Anthropic SDK provider pointed at the fake server above.
      command: `rm -rf .data-e2e && npx next dev -p ${PORT}`,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NOCTURNE_DATA_DIR: ".data-e2e",
        AI_PROVIDER: "anthropic",
        AI_MODEL: "claude-opus-5-5",
        ANTHROPIC_API_KEY: "sk-e2e-test",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
        AI_RATE_LIMIT_PER_MINUTE: "100",
        // Small history budget so the memory test reaches the folding point quickly.
        AI_CONTEXT_MAX_TOKENS: "2000",
      },
      port: PORT,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
