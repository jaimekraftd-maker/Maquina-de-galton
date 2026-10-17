import "server-only";
import { config } from "@/lib/config";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";
import type { ChatProvider } from "./types";

/**
 * Provider registry. To add a provider, implement ChatProvider in its own file
 * and register a factory here; nothing else in the app needs to change.
 */
const PROVIDERS: Record<string, () => ChatProvider> = {
  anthropic: () => new AnthropicProvider(config.ai.model),
  demo: () => new DemoProvider(),
};

let cached: { key: string; provider: ChatProvider } | null = null;

export function getProvider(): ChatProvider {
  const key = `${config.ai.provider}:${config.ai.model}`;
  if (cached?.key === key) return cached.provider;
  const factory = PROVIDERS[config.ai.provider];
  const provider: ChatProvider = factory
    ? factory()
    : {
        id: config.ai.provider,
        model: config.ai.model,
        configurationProblem: () =>
          `Unknown AI_PROVIDER "${config.ai.provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}.`,
        generate: () => Promise.reject(new Error("unknown provider")),
      };
  cached = { key, provider };
  return provider;
}

export type { ChatProvider } from "./types";
