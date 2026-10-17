import { describe, expect, it } from "vitest";
import { rejectCrossSite } from "@/lib/http";
import { sniffImageType } from "@/lib/images";
import { RateLimiter } from "@/lib/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window and reports retry time", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.take("u", 0)).toBe(0);
    expect(rl.take("u", 100)).toBe(0);
    expect(rl.take("u", 200)).toBe(800);
    expect(rl.take("other", 200)).toBe(0);
    expect(rl.take("u", 1001)).toBe(0);
  });
});

describe("sniffImageType", () => {
  it("detects real image signatures and rejects others", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBe("image/gif");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});


describe("rejectCrossSite", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/chat", { method: "POST", headers });
  it("allows same-origin and origin-less requests", () => {
    expect(rejectCrossSite(req({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBeNull();
    expect(rejectCrossSite(req({ host: "localhost:3000" }))).toBeNull();
  });
  it("rejects other origins", () => {
    expect(rejectCrossSite(req({ host: "localhost:3000", origin: "https://evil.example" }))?.status).toBe(403);
  });
});
