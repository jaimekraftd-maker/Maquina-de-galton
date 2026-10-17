// Minimal stand-in for the Anthropic Messages API used by the end-to-end tests.
// Streams an in-character-looking reply word by word. A user message containing
// "slow" streams very slowly so the Stop button can be exercised.
import http from "node:http";

const port = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4010);
let counter = 0;
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      if (!req.url?.startsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw);
      const system = body.system?.[0]?.text ?? "";
      const name = /^You are (.+?), a fictional character/m.exec(system)?.[1] ?? "Unknown";
      const last = body.messages.at(-1)?.content ?? "";
      const slow = /slow/i.test(last);
      counter += 1;
      const words = `[fake reply ${counter}] ${name} hears you say "${last}". ${slow ? "This answer takes a very long time to finish and keeps going on and on ".repeat(8) : "The end."}`.split(/(?<= )/);

      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, "message_start", {
        type: "message_start",
        message: { id: `msg_${counter}`, type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
      });
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      let closed = false;
      res.on("close", () => (closed = true));
      for (const w of words) {
        if (closed) return;
        sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: w } });
        await new Promise((r) => setTimeout(r, slow ? 250 : 15));
      }
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: words.length } });
      sse(res, "message_stop", { type: "message_stop" });
      res.end();
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`fake anthropic on ${port}`));
