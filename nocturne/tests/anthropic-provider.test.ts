// Exercises the real @anthropic-ai/sdk client against a local fake of the
// Messages API (SSE streaming), verifying request shape, streaming, error
// mapping and cancellation without network access or an API key.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { ProviderError } from "@/lib/ai/types";

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void;

let handler: Handler;
let requests: { headers: http.IncomingHttpHeaders; body: Record<string, unknown>; url: string }[] = [];
let server: http.Server;

const sse = (res: http.ServerResponse, event: string, data: unknown) =>
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

function streamReply(chunks: string[], { stopReason = "end_turn", holdAfterFirst = false } = {}): Handler {
  return (_req, _body, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    sse(res, "message_start", {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 42, output_tokens: 1 },
      },
    });
    sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    chunks.forEach((text, i) => {
      if (holdAfterFirst && i > 0) return;
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
    });
    if (holdAfterFirst) return; // keep the connection open until the client aborts
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 7 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  };
}

function errorReply(status: number, type: string, extraHeaders: Record<string, string> = {}): Handler {
  return (_req, _body, res) => {
    res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
    res.end(JSON.stringify({ type: "error", error: { type, message: `fake ${type}` } }));
  };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ headers: req.headers, body: body ? JSON.parse(body) : {}, url: req.url ?? "" });
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "sk-test-key";
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.AI_EFFORT;
});

afterAll(() => server.close());
beforeEach(() => {
  requests = [];
});

const baseRequest = () => ({
  system: "You are Test, a fictional character.",
  messages: [{ role: "user" as const, content: "Hello" }],
  signal: new AbortController().signal,
});

describe("AnthropicProvider (official SDK)", () => {
  it("streams text deltas and returns usage", async () => {
    handler = streamReply(["Hel", "lo ", "there"]);
    const deltas: string[] = [];
    const result = await new AnthropicProvider("claude-opus-5-5").generate({ ...baseRequest(), onText: (d) => deltas.push(d) });

    expect(deltas.join("")).toBe("Hello there");
    expect(result).toMatchObject({ model: "claude-opus-5-5", stopReason: "end_turn", inputTokens: 42, outputTokens: 7, refused: false });

    const [req] = requests;
    expect(req.url).toMatch(/^\/v1\/messages/);
    expect(req.headers["x-api-key"]).toBe("sk-test-key");
    expect(String(req.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(req.body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      messages: [{ role: "user", content: "Hello" }],
    });
    expect((req.body.system as { cache_control: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.body).not.toHaveProperty("thinking");
  });

  it("omits server fallbacks for models that don't support them", async () => {
    handler = streamReply(["ok"]);
    await new AnthropicProvider("claude-haiku-5-5").generate({ ...baseRequest(), onText: () => {} });
    expect(requests[0].body).not.toHaveProperty("fallbacks");
    expect(requests[0].headers["anthropic-beta"]).toBeUndefined();
  });

  it("reports refusals", async () => {
    handler = streamReply([], { stopReason: "refusal" });
    const result = await new AnthropicProvider().generate({ ...baseRequest(), onText: () => {} });
    expect(result.refused).toBe(true);
  });

  it("maps rate limits to a retryable error after SDK retries", async () => {
    handler = errorReply(429, "rate_limit_error", { "retry-after-ms": "1" });
    const err = await new AnthropicProvider().generate({ ...baseRequest(), onText: () => {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "rate_limit", retryable: true });
    expect(requests).toHaveLength(3); // initial attempt + 2 SDK retries
  });

  it("maps authentication failures without retrying and without leaking details", async () => {
    handler = errorReply(401, "authentication_error");
    const err = await new AnthropicProvider().generate({ ...baseRequest(), onText: () => {} }).catch((e) => e);
    expect(err).toMatchObject({ kind: "auth", retryable: false });
    expect(err.message).not.toContain("sk-test-key");
    expect(requests).toHaveLength(1);
  });

  it("stops promptly when the signal is aborted mid-stream", async () => {
    handler = streamReply(["partial", "never sent"], { holdAfterFirst: true });
    const controller = new AbortController();
    const deltas: string[] = [];
    const err = await new AnthropicProvider()
      .generate({
        ...baseRequest(),
        signal: controller.signal,
        onText: (d) => {
          deltas.push(d);
          controller.abort();
        },
      })
      .catch((e) => e);
    expect(deltas).toEqual(["partial"]);
    expect(err).toMatchObject({ kind: "aborted" });
  });

  it("reports a missing API key as a configuration problem", () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(new AnthropicProvider().configurationProblem()).toMatch(/ANTHROPIC_API_KEY/);
    process.env.ANTHROPIC_API_KEY = key;
    expect(new AnthropicProvider().configurationProblem()).toBeNull();
  });
});
