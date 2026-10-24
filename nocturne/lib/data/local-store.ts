import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DataStore } from "./store";
import { SEED_CHARACTERS } from "./seed";
import { searchInMemory, toSummary } from "./search";
import type {
  Character,
  CharacterInput,
  CharacterQuery,
  Conversation,
  ConversationMemory,
  ConversationWithCharacter,
  Message,
  MessageMetadata,
  MessageRole,
  Profile,
} from "./types";

export const LOCAL_USER_ID = "11111111-1111-4111-8111-111111111111";
export const LOCAL_USER_NAME = "Local Explorer";

type StoredCharacter = Omit<Character, "chatCount" | "creatorName">;

interface Favorite {
  userId: string;
  characterId: string;
  createdAt: string;
}

interface Db {
  version: 1;
  nextSeq: number;
  profiles: Profile[];
  characters: StoredCharacter[];
  conversations: Conversation[];
  messages: Message[];
  favorites: Favorite[];
}

function now() {
  return new Date().toISOString();
}

function emptyDb(): Db {
  return {
    version: 1,
    nextSeq: 1,
    profiles: [{ id: LOCAL_USER_ID, displayName: LOCAL_USER_NAME, avatarUrl: null, createdAt: now() }],
    characters: [],
    conversations: [],
    messages: [],
    favorites: [],
  };
}

/**
 * Single-user JSON file store for local development without Supabase.
 * Writes are serialized and atomic (write to temp file, then rename).
 */
export class LocalStore implements DataStore {
  private db: Db | null = null;
  private loading: Promise<Db> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<Db> {
    if (this.db) return this.db;
    if (!this.loading) {
      this.loading = (async () => {
        let db: Db;
        try {
          db = JSON.parse(await fs.readFile(this.file, "utf8")) as Db;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          db = emptyDb();
        }
        // Make sure every built-in character exists (new seeds appear after upgrades).
        for (const seed of SEED_CHARACTERS) {
          if (!db.characters.some((c) => c.id === seed.id)) {
            const { id, featured, createdAt, ...input } = seed;
            db.characters.push({ ...input, id, featured, createdAt, updatedAt: createdAt, creatorId: null });
          }
        }
        this.db = db;
        await this.persist();
        return db;
      })();
    }
    return this.loading;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.db, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, snapshot, "utf8");
      await fs.rename(tmp, this.file);
    });
    return this.writeChain;
  }

  private hydrate(db: Db, c: StoredCharacter): Character {
    const creator = c.creatorId ? db.profiles.find((p) => p.id === c.creatorId) : null;
    return {
      ...c,
      creatorName: creator?.displayName ?? null,
      chatCount: db.conversations.filter((conv) => conv.characterId === c.id).length,
    };
  }

  private visible(c: StoredCharacter, viewerId: string | null) {
    return c.visibility === "public" || (viewerId !== null && c.creatorId === viewerId);
  }

  private ownedConversation(db: Db, viewerId: string, id: string) {
    return db.conversations.find((c) => c.id === id && c.userId === viewerId) ?? null;
  }

  // ---- Characters -------------------------------------------------------

  async searchCharacters(viewerId: string | null, query: CharacterQuery) {
    const db = await this.load();
    const chars = db.characters.filter((c) => this.visible(c, viewerId)).map((c) => this.hydrate(db, c));
    return searchInMemory(chars, query);
  }

  async getCharacter(viewerId: string | null, id: string) {
    const db = await this.load();
    const c = db.characters.find((x) => x.id === id);
    return c && this.visible(c, viewerId) ? this.hydrate(db, c) : null;
  }

  async listCharactersByCreator(viewerId: string) {
    const db = await this.load();
    return db.characters
      .filter((c) => c.creatorId === viewerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => toSummary(this.hydrate(db, c)));
  }

  async createCharacter(viewerId: string, input: CharacterInput) {
    const db = await this.load();
    const ts = now();
    const c: StoredCharacter = { ...input, id: randomUUID(), creatorId: viewerId, featured: false, createdAt: ts, updatedAt: ts };
    db.characters.push(c);
    await this.persist();
    return this.hydrate(db, c);
  }

  async updateCharacter(viewerId: string, id: string, input: CharacterInput) {
    const db = await this.load();
    const idx = db.characters.findIndex((c) => c.id === id && c.creatorId === viewerId);
    if (idx === -1) return null;
    db.characters[idx] = { ...db.characters[idx], ...input, updatedAt: now() };
    await this.persist();
    return this.hydrate(db, db.characters[idx]);
  }

  async deleteCharacter(viewerId: string, id: string) {
    const db = await this.load();
    const c = db.characters.find((x) => x.id === id && x.creatorId === viewerId);
    if (!c) return false;
    // Mirror the SQL schema: deleting a character cascades to its conversations and favorites.
    const convIds = new Set(db.conversations.filter((x) => x.characterId === id).map((x) => x.id));
    db.characters = db.characters.filter((x) => x.id !== id);
    db.conversations = db.conversations.filter((x) => !convIds.has(x.id));
    db.messages = db.messages.filter((m) => !convIds.has(m.conversationId));
    db.favorites = db.favorites.filter((f) => f.characterId !== id);
    await this.persist();
    return true;
  }

  // ---- Favorites --------------------------------------------------------

  async listFavorites(viewerId: string) {
    const db = await this.load();
    return db.favorites
      .filter((f) => f.userId === viewerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((f) => db.characters.find((c) => c.id === f.characterId))
      .filter((c): c is StoredCharacter => !!c && this.visible(c, viewerId))
      .map((c) => toSummary(this.hydrate(db, c)));
  }

  async isFavorite(viewerId: string, characterId: string) {
    const db = await this.load();
    return db.favorites.some((f) => f.userId === viewerId && f.characterId === characterId);
  }

  async setFavorite(viewerId: string, characterId: string, favorite: boolean) {
    const db = await this.load();
    const exists = db.favorites.some((f) => f.userId === viewerId && f.characterId === characterId);
    if (favorite && !exists) {
      const c = db.characters.find((x) => x.id === characterId);
      if (!c || !this.visible(c, viewerId)) return;
      db.favorites.push({ userId: viewerId, characterId, createdAt: now() });
    } else if (!favorite && exists) {
      db.favorites = db.favorites.filter((f) => !(f.userId === viewerId && f.characterId === characterId));
    } else {
      return;
    }
    await this.persist();
  }

  // ---- Conversations ----------------------------------------------------

  async listConversations(viewerId: string, limit = 100): Promise<ConversationWithCharacter[]> {
    const db = await this.load();
    return db.conversations
      .filter((c) => c.userId === viewerId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt.localeCompare(a.lastActivityAt))
      .slice(0, limit)
      .map((conv) => {
        const c = db.characters.find((x) => x.id === conv.characterId);
        const last = db.messages
          .filter((m) => m.conversationId === conv.id)
          .reduce<Message | null>((acc, m) => (!acc || m.seq > acc.seq ? m : acc), null);
        return {
          ...conv,
          character: c ? { id: c.id, name: c.name, avatarUrl: c.avatarUrl, tagline: c.tagline } : null,
          lastMessagePreview: last ? last.content.slice(0, 160) : null,
        };
      });
  }

  async getConversation(viewerId: string, id: string) {
    const db = await this.load();
    return this.ownedConversation(db, viewerId, id);
  }

  async latestConversationFor(viewerId: string, characterId: string) {
    const db = await this.load();
    return (
      db.conversations
        .filter((c) => c.userId === viewerId && c.characterId === characterId)
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0] ?? null
    );
  }

  async createConversation(viewerId: string, characterId: string, title: string) {
    const db = await this.load();
    const c = db.characters.find((x) => x.id === characterId);
    if (!c || !this.visible(c, viewerId)) throw new Error("Character not found");
    const ts = now();
    const conv: Conversation = {
      id: randomUUID(),
      userId: viewerId,
      characterId,
      title,
      pinned: false,
      createdAt: ts,
      lastActivityAt: ts,
    };
    db.conversations.push(conv);
    await this.persist();
    return conv;
  }

  async updateConversation(viewerId: string, id: string, patch: Partial<Pick<Conversation, "title" | "pinned">>) {
    const db = await this.load();
    const conv = this.ownedConversation(db, viewerId, id);
    if (!conv) return false;
    if (patch.title !== undefined) conv.title = patch.title;
    if (patch.pinned !== undefined) conv.pinned = patch.pinned;
    await this.persist();
    return true;
  }

  async setConversationMemory(viewerId: string, id: string, memory: ConversationMemory | null) {
    const db = await this.load();
    const conv = this.ownedConversation(db, viewerId, id);
    if (!conv) return false;
    conv.memory = memory;
    await this.persist();
    return true;
  }

  async deleteConversation(viewerId: string, id: string) {
    const db = await this.load();
    if (!this.ownedConversation(db, viewerId, id)) return false;
    db.conversations = db.conversations.filter((c) => c.id !== id);
    db.messages = db.messages.filter((m) => m.conversationId !== id);
    await this.persist();
    return true;
  }

  // ---- Messages ---------------------------------------------------------

  async listMessages(viewerId: string, conversationId: string) {
    const db = await this.load();
    if (!this.ownedConversation(db, viewerId, conversationId)) return [];
    return db.messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.seq - b.seq);
  }

  async addMessage(
    viewerId: string,
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata: MessageMetadata = {},
  ) {
    const db = await this.load();
    const conv = this.ownedConversation(db, viewerId, conversationId);
    if (!conv) throw new Error("Conversation not found");
    const ts = now();
    const msg: Message = { id: randomUUID(), conversationId, role, content, seq: db.nextSeq++, metadata, createdAt: ts };
    db.messages.push(msg);
    conv.lastActivityAt = ts;
    await this.persist();
    return msg;
  }

  async updateMessage(viewerId: string, messageId: string, content: string, metadata?: MessageMetadata) {
    const db = await this.load();
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg || !this.ownedConversation(db, viewerId, msg.conversationId)) return false;
    msg.content = content;
    if (metadata) msg.metadata = { ...msg.metadata, ...metadata };
    await this.persist();
    return true;
  }

  async deleteMessagesAfter(viewerId: string, conversationId: string, afterSeq: number) {
    const db = await this.load();
    if (!this.ownedConversation(db, viewerId, conversationId)) return;
    db.messages = db.messages.filter((m) => !(m.conversationId === conversationId && m.seq > afterSeq));
    await this.persist();
  }

  async deleteMessage(viewerId: string, messageId: string) {
    const db = await this.load();
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg || !this.ownedConversation(db, viewerId, msg.conversationId)) return;
    db.messages = db.messages.filter((m) => m.id !== messageId);
    await this.persist();
  }
}
