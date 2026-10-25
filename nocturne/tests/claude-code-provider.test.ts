// Runs the real Claude Agent SDK (and the Claude Code binary it bundles) against
// a local fake of the Messages API. The fake is authenticated with a test API key
// so no Claude account is needed in CI; real use relies on the Claude Code login.
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ClaudeCodeProvider, transcript } from "@/lib/ai/claude-code";
import { ProviderError } from "@/lib/ai/types";

type Mode = { kind: "reply"; chunks: string[] } | { kind: "error"; status: number; type: string };
let mode: Mode = { kind: "reply", chunks: [] };
let requests: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
let server: http.Server;
let configDir: string;
const savedEnv = { ...process.env };

const sse = (res: http.ServerResponse, event: string, data: unknown) =>
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: req.url ?? "", headers: req.headers, body });
      if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "nope" } }));
        return;
      }
      if (mode.kind === "error") {
        res.writeHead(mode.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: mode.type, message: `fake ${mode.type}` } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, "message_start", {
        type: "message_start",
        message: { id: "msg_cc", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 30, output_tokens: 1 } },
      });
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      for (const text of mode.chunks) sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } });
      sse(res, "message_stop", { type: "message_stop" });
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  configDir = mkdtempSync(path.join(tmpdir(), "cc-config-"));
  // Isolate the Claude Code process from any login or settings on this machine.
  for (const k of Object.keys(process.env)) if (k.startsWith("CLAUDE_CODE_") || k.startsWith("CLAUDE_AGENT")) delete process.env[k];
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  Object.assign(process.env, {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    ANTHROPIC_API_KEY: "sk-cc-test",
    NOCTURNE_CLAUDE_CODE_USE_API_KEY: "true",
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
  });
}, 30_000);

afterAll(() => {
  server.close();
  rmSync(configDir, { recursive: true, force: true });
  process.env = savedEnv;
});
beforeEach(() => {
  requests = [];
});

const req = (signal = new AbortController().signal) => ({
  system: "You are Mira Hoshizora, a fictional character in an interactive chat.",
  messages: [
    { role: "user" as const, content: "(The conversation begins.)" },
    { role: "assistant" as const, content: "Welcome to Café Comet!" },
    { role: "user" as const, content: "One Nebula Latte please" },
  ],
  signal,
});

describe("transcript", () => {
  it("flattens history and ends with the latest user message", () => {
    const t = transcript(req().messages);
    expect(t).toContain("You: Welcome to Café Comet!");
    expect(t).toMatch(/The user now says:\n\nOne Nebula Latte please/);
  });
});

describe("ClaudeCodeProvider (Claude Agent SDK)", () => {
  it("streams a reply through the Claude Code binary with tools disabled", async () => {
    mode = { kind: "reply", chunks: ["Coming ", "right ", "up!"] };
    const deltas: string[] = [];
    const result = await new ClaudeCodeProvider("claude-opus-5-5").generate({ ...req(), onText: (d) => deltas.push(d) });

    expect(deltas.join("")).toBe("Coming right up!");
    expect(result.stopReason).toBe("end_turn");
    const chat = requests.filter((r) => r.url.startsWith("/v1/messages") && Array.isArray(r.body.messages));
    const main = chat.find((r) => JSON.stringify(r.body.system ?? "").includes("Mira Hoshizora"));
    expect(main, `requests seen: ${requests.map((r) => r.url).join(", ")}`).toBeDefined();
    expect(main!.body.model).toBe("claude-opus-5-5");
    expect(main!.body.tools ?? []).toEqual([]);
    expect(JSON.stringify(main!.body.messages)).toContain("One Nebula Latte please");
  }, 90_000);

  it("maps authentication failures to a log-in message", async () => {
    mode = { kind: "error", status: 401, type: "authentication_error" };
    const err = await new ClaudeCodeProvider().generate({ ...req(), onText: () => {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("auth");
    expect(err.message).toMatch(/log in/i);
  }, 90_000);

  it("stops when aborted", async () => {
    mode = { kind: "reply", chunks: ["never"] };
    const controller = new AbortController();
    const pending = new ClaudeCodeProvider().generate({ ...req(controller.signal), onText: () => {} });
    setTimeout(() => controller.abort(), 50);
    const err = await pending.catch((e) => e);
    expect(err).toMatchObject({ kind: "aborted" });
  }, 90_000);
});
