import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStore } from "@/lib/data/local-store";
import { SEED_CHARACTERS } from "@/lib/data/seed";
import type { CharacterInput } from "@/lib/data/types";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const input: CharacterInput = {
  name: "Secret",
  tagline: "t",
  description: "d",
  personality: "p",
  traits: [],
  background: "",
  greeting: "hello",
  scenario: "",
  exampleDialogue: "",
  speakingStyle: "",
  tags: [],
  categories: ["original"],
  avatarUrl: null,
  visibility: "private",
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "nocturne-"));
  file = path.join(dir, "db.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("LocalStore", () => {
  it("seeds the demo characters and persists to disk", async () => {
    const store = new LocalStore(file);
    const all = await store.searchCharacters(null, {});
    expect(all).toHaveLength(SEED_CHARACTERS.length);
    const disk = JSON.parse(readFileSync(file, "utf8"));
    expect(disk.characters).toHaveLength(SEED_CHARACTERS.length);
  });

  it("isolates private characters and conversations between users", async () => {
    const store = new LocalStore(file);
    const secret = await store.createCharacter(ALICE, input);
    expect(await store.getCharacter(BOB, secret.id)).toBeNull();
    expect(await store.getCharacter(null, secret.id)).toBeNull();
    expect(await store.updateCharacter(BOB, secret.id, { ...input, name: "Hacked" })).toBeNull();
    expect(await store.deleteCharacter(BOB, secret.id)).toBe(false);
    await expect(store.createConversation(BOB, secret.id, "peek")).rejects.toThrow();

    const conv = await store.createConversation(ALICE, SEED_CHARACTERS[0].id, "mine");
    await store.addMessage(ALICE, conv.id, "user", "private words");
    expect(await store.getConversation(BOB, conv.id)).toBeNull();
    expect(await store.listMessages(BOB, conv.id)).toEqual([]);
    await expect(store.addMessage(BOB, conv.id, "user", "injected")).rejects.toThrow();
    expect(await store.deleteConversation(BOB, conv.id)).toBe(false);
    expect(await store.listConversations(BOB)).toEqual([]);
  });

  it("persists messages across instances and supports truncation", async () => {
    const a = new LocalStore(file);
    const conv = await a.createConversation(ALICE, SEED_CHARACTERS[1].id, "chat");
    const m1 = await a.addMessage(ALICE, conv.id, "assistant", "greeting");
    await a.addMessage(ALICE, conv.id, "user", "one");
    await a.addMessage(ALICE, conv.id, "assistant", "two");

    const b = new LocalStore(file); // simulates a server restart
    expect((await b.listMessages(ALICE, conv.id)).map((m) => m.content)).toEqual(["greeting", "one", "two"]);
    await b.deleteMessagesAfter(ALICE, conv.id, m1.seq);
    expect((await b.listMessages(ALICE, conv.id)).map((m) => m.content)).toEqual(["greeting"]);
    expect((await b.getCharacter(ALICE, SEED_CHARACTERS[1].id))!.chatCount).toBe(1);
  });

  it("cascades character deletion to conversations and favorites", async () => {
    const store = new LocalStore(file);
    const c = await store.createCharacter(ALICE, { ...input, visibility: "public" });
    const conv = await store.createConversation(BOB, c.id, "bob chat");
    await store.setFavorite(BOB, c.id, true);
    expect(await store.isFavorite(BOB, c.id)).toBe(true);
    expect(await store.deleteCharacter(ALICE, c.id)).toBe(true);
    expect(await store.getConversation(BOB, conv.id)).toBeNull();
    expect(await store.listFavorites(BOB)).toEqual([]);
  });
});
