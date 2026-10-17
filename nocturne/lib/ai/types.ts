export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  system: string;
  messages: ChatTurn[];
  signal: AbortSignal;
  /** Called with each streamed text fragment, in order. */
  onText: (delta: string) => void;
}

export interface GenerateResult {
  model: string;
  stopReason: string | null;
  inputTokens?: number;
  outputTokens?: number;
  /** The provider declined to answer (safety refusal). */
  refused?: boolean;
}

export type ProviderErrorKind =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "network"
  | "bad_request"
  | "aborted"
  | "unknown";

/** Normalized provider failure. `message` is safe to show to end users. */
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * A conversational model backend. Implementations live next to this file and
 * are selected by the AI_PROVIDER environment variable in ./index.ts.
 */
export interface ChatProvider {
  readonly id: string;
  readonly model: string;
  /** Human-readable reason when the provider cannot be used, or null if ready. */
  configurationProblem(): string | null;
  /** Streams a reply. Must reject with ProviderError("aborted") when `signal` fires. */
  generate(req: GenerateRequest): Promise<GenerateResult>;
}
