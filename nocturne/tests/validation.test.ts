import { describe, expect, it } from "vitest";
import { avatarUrlSchema, characterInputSchema, chatRequestSchema, fieldErrors } from "@/lib/validation";

const valid = {
  name: "Test",
  tagline: "A test character",
  description: "Desc",
  personality: "Kind",
  greeting: "Hello!",
  categories: ["original"],
};

describe("characterInputSchema", () => {
  it("accepts a minimal character and fills defaults", () => {
    const r = characterInputSchema.parse(valid);
    expect(r.visibility).toBe("public");
    expect(r.tags).toEqual([]);
    expect(r.avatarUrl).toBeNull();
  });

  it("reports missing required fields", () => {
    const r = characterInputSchema.safeParse({ ...valid, name: "  ", greeting: "", categories: [] });
    expect(r.success).toBe(false);
    const errs = fieldErrors(r.error!);
    expect(Object.keys(errs).sort()).toEqual(["categories", "greeting", "name"]);
  });

  it("normalizes and dedupes tags, rejects unknown categories", () => {
    expect(characterInputSchema.parse({ ...valid, tags: ["Cozy", "cozy ", "Space"] }).tags).toEqual(["cozy", "space"]);
    expect(characterInputSchema.safeParse({ ...valid, categories: ["horror"] }).success).toBe(false);
  });

  it("enforces length limits", () => {
    expect(characterInputSchema.safeParse({ ...valid, name: "x".repeat(61) }).success).toBe(false);
  });
});

describe("avatarUrlSchema", () => {
  it.each(["/characters/mira.svg", "/api/uploads/0b8f3e9c-1111-4111-8111-111111111111.png", "https://example.com/a.png"])(
    "accepts %s",
    (url) => expect(avatarUrlSchema.safeParse(url).success).toBe(true),
  );
  it.each(["javascript:alert(1)", "http://example.com/a.png", "data:image/png;base64,AAAA", "/characters/../secret", "//evil.com/x.png"])(
    "rejects %s",
    (url) => expect(avatarUrlSchema.safeParse(url).success).toBe(false),
  );
});

describe("chatRequestSchema", () => {
  const id = "0b8f3e9c-1111-4111-8111-111111111111";
  it("validates each mode", () => {
    expect(chatRequestSchema.safeParse({ mode: "send", conversationId: id, content: "hi" }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ mode: "send", conversationId: id, content: "   " }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ mode: "edit", conversationId: id, content: "hi" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ mode: "regenerate", conversationId: "nope" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ mode: "send", conversationId: id, content: "x".repeat(8001) }).success).toBe(false);
  });
});
