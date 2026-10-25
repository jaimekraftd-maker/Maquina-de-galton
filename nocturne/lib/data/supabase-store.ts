import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore } from "./store";
import { toSummary } from "./search";
import type {
  CategoryId,
  Character,
  CharacterInput,
  CharacterQuery,
  Conversation,
  ConversationMemory,
  ConversationWithCharacter,
  Message,
  MessageMetadata,
  MessageRole,
  Visibility,
} from "./types";

interface CharacterRow {
  id: string;
  creator_id: string | null;
  creator_name?: string | null;
  name: string;
  tagline: string;
  description: string;
  personality: string;
  traits: string[];
  background: string;
  greeting: string;
  scenario: string;
  example_dialogue: string;
  speaking_style: string;
  tags: string[];
  categories: string[];
  avatar_url: string | null;
  visibility: Visibility;
  featured: boolean;
  chat_count: number;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
  user_id: string;
  character_id: string;
  title: string;
  pinned: boolean;
  created_at: string;
  last_activity_at: string;
  memory_summary?: string | null;
  memory_through_seq?: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  created_at: string;
}

const toCharacter = (r: CharacterRow): Character => ({
  id: r.id,
  creatorId: r.creator_id,
  creatorName: r.creator_name ?? null,
  name: r.name,
  tagline: r.tagline,
  description: r.description,
  personality: r.personality,
  traits: r.traits ?? [],
  background: r.background,
  greeting: r.greeting,
  scenario: r.scenario,
  exampleDialogue: r.example_dialogue,
  speakingStyle: r.speaking_style,
  tags: r.tags ?? [],
  categories: (r.categories ?? []) as CategoryId[],
  avatarUrl: r.avatar_url,
  visibility: r.visibility,
  featured: r.featured,
  chatCount: r.chat_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (c: CharacterInput) => ({
  name: c.name,
  tagline: c.tagline,
  description: c.description,
  personality: c.personality,
  traits: c.traits,
  background: c.background,
  greeting: c.greeting,
  scenario: c.scenario,
  example_dialogue: c.exampleDialogue,
  speaking_style: c.speakingStyle,
  tags: c.tags,
  categories: c.categories,
  avatar_url: c.avatarUrl,
  visibility: c.visibility,
});

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  userId: r.user_id,
  characterId: r.character_id,
  title: r.title,
  pinned: r.pinned,
  createdAt: r.created_at,
  lastActivityAt: r.last_activity_at,
  memory:
    r.memory_summary && r.memory_through_seq != null
      ? { summary: r.memory_summary, throughSeq: Number(r.memory_through_seq) }
      : null,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  seq: Number(r.seq),
  role: r.role,
  content: r.content,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/**
 * Supabase-backed store. The client carries the user's session, so every query
 * is subject to the RLS policies in supabase/migrations. Explicit user filters
 * are kept as defence in depth and to use the right indexes.
 */
export class SupabaseStore implements DataStore {
  constructor(private readonly sb: SupabaseClient) {}

  async searchCharacters(_viewerId: string | null, query: CharacterQuery) {
    const rows = check(
      await this.sb.rpc("search_characters", {
        q: query.q?.trim() || null,
        cat: query.category ?? null,
        sort: query.sort ?? (query.q?.trim() ? null : "popular"),
        lim: query.limit ?? 60,
      }),
      "search characters",
    ) as CharacterRow[];
    return rows.map((r) => toSummary(toCharacter(r)));
  }

  async getCharacter(_viewerId: string | null, id: string) {
    const row = check(
      await this.sb.from("characters_with_creator").select("*").eq("id", id).maybeSingle(),
      "load character",
    ) as CharacterRow | null;
    return row ? toCharacter(row) : null;
  }

  async listCharactersByCreator(viewerId: string) {
    const rows = check(
      await this.sb
        .from("characters_with_creator")
        .select("*")
        .eq("creator_id", viewerId)
        .order("updated_at", { ascending: false }),
      "list characters",
    ) as CharacterRow[];
    return rows.map((r) => toSummary(toCharacter(r)));
  }

  async createCharacter(_viewerId: string, input: CharacterInput) {
    const row = check(
      await this.sb.from("characters").insert(toRow(input)).select("id").single(),
      "create character",
    ) as { id: string };
    const created = await this.getCharacter(_viewerId, row.id);
    if (!created) throw new Error("create character: row not readable after insert");
    return created;
  }

  async updateCharacter(viewerId: string, id: string, input: CharacterInput) {
    const rows = check(
      await this.sb.from("characters").update(toRow(input)).eq("id", id).eq("creator_id", viewerId).select("id"),
      "update character",
    ) as { id: string }[];
    return rows.length ? this.getCharacter(viewerId, id) : null;
  }

  async deleteCharacter(viewerId: string, id: string) {
    const rows = check(
      await this.sb.from("characters").delete().eq("id", id).eq("creator_id", viewerId).select("id"),
      "delete character",
    ) as { id: string }[];
    return rows.length > 0;
  }

  async listFavorites(viewerId: string) {
    const favs = check(
      await this.sb
        .from("favorites")
        .select("character_id, created_at")
        .eq("user_id", viewerId)
        .order("created_at", { ascending: false }),
      "list favorites",
    ) as { character_id: string }[];
    if (!favs.length) return [];
    const rows = check(
      await this.sb
        .from("characters_with_creator")
        .select("*")
        .in(
          "id",
          favs.map((f) => f.character_id),
        ),
      "load favorites",
    ) as CharacterRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return favs
      .map((f) => byId.get(f.character_id))
      .filter((r): r is CharacterRow => !!r)
      .map((r) => toSummary(toCharacter(r)));
  }

  async isFavorite(viewerId: string, characterId: string) {
    const { count, error } = await this.sb
      .from("favorites")
      .select("character_id", { count: "exact", head: true })
      .eq("user_id", viewerId)
      .eq("character_id", characterId);
    if (error) throw new Error(`favorite status: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async setFavorite(viewerId: string, characterId: string, favorite: boolean) {
    if (favorite) {
      const { error } = await this.sb.from("favorites").insert({ character_id: characterId });
      // 23505 = already favorited
      if (error && error.code !== "23505") throw new Error(`add favorite: ${error.message}`);
    } else {
      check(
        await this.sb.from("favorites").delete().eq("user_id", viewerId).eq("character_id", characterId),
        "remove favorite",
      );
    }
  }

  async listConversations(viewerId: string, limit = 100): Promise<ConversationWithCharacter[]> {
    const rows = check(
      await this.sb
        .from("conversations")
        .select("*, character:characters(id, name, avatar_url, tagline)")
        .eq("user_id", viewerId)
        .order("pinned", { ascending: false })
        .order("last_activity_at", { ascending: false })
        .limit(limit),
      "list conversations",
    ) as (ConversationRow & {
      character: { id: string; name: string; avatar_url: string | null; tagline: string } | null;
    })[];

    // One query for the latest message of each listed conversation.
    const previews = new Map<string, string>();
    if (rows.length) {
      const msgs = check(
        await this.sb
          .from("messages")
          .select("conversation_id, content, seq")
          .in(
            "conversation_id",
            rows.map((r) => r.id),
          )
          .order("seq", { ascending: false })
          .limit(Math.min(rows.length * 6, 1000)),
        "load previews",
      ) as { conversation_id: string; content: string }[];
      for (const m of msgs) if (!previews.has(m.conversation_id)) previews.set(m.conversation_id, m.content.slice(0, 160));
    }

    return rows.map((r) => ({
      ...toConversation(r),
      character: r.character
        ? { id: r.character.id, name: r.character.name, avatarUrl: r.character.avatar_url, tagline: r.character.tagline }
        : null,
      lastMessagePreview: previews.get(r.id) ?? null,
    }));
  }

  async getConversation(viewerId: string, id: string) {
    const row = check(
      await this.sb.from("conversations").select("*").eq("id", id).eq("user_id", viewerId).maybeSingle(),
      "load conversation",
    ) as ConversationRow | null;
    return row ? toConversation(row) : null;
  }

  async latestConversationFor(viewerId: string, characterId: string) {
    const row = check(
      await this.sb
        .from("conversations")
        .select("*")
        .eq("user_id", viewerId)
        .eq("character_id", characterId)
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load latest conversation",
    ) as ConversationRow | null;
    return row ? toConversation(row) : null;
  }

  async createConversation(_viewerId: string, characterId: string, title: string) {
    const row = check(
      await this.sb.from("conversations").insert({ character_id: characterId, title }).select("*").single(),
      "create conversation",
    ) as ConversationRow;
    return toConversation(row);
  }

  async updateConversation(viewerId: string, id: string, patch: Partial<Pick<Conversation, "title" | "pinned">>) {
    const rows = check(
      await this.sb.from("conversations").update(patch).eq("id", id).eq("user_id", viewerId).select("id"),
      "update conversation",
    ) as { id: string }[];
    return rows.length > 0;
  }

  async setConversationMemory(viewerId: string, id: string, memory: ConversationMemory | null) {
    const rows = check(
      await this.sb
        .from("conversations")
        .update({ memory_summary: memory?.summary ?? null, memory_through_seq: memory?.throughSeq ?? null })
        .eq("id", id)
        .eq("user_id", viewerId)
        .select("id"),
      "save conversation memory",
    ) as { id: string }[];
    return rows.length > 0;
  }

  async deleteConversation(viewerId: string, id: string) {
    const rows = check(
      await this.sb.from("conversations").delete().eq("id", id).eq("user_id", viewerId).select("id"),
      "delete conversation",
    ) as { id: string }[];
    return rows.length > 0;
  }

  async listMessages(viewerId: string, conversationId: string) {
    if (!(await this.getConversation(viewerId, conversationId))) return [];
    const rows = check(
      await this.sb.from("messages").select("*").eq("conversation_id", conversationId).order("seq", { ascending: true }),
      "list messages",
    ) as MessageRow[];
    return rows.map(toMessage);
  }

  async addMessage(
    _viewerId: string,
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata: MessageMetadata = {},
  ) {
    const row = check(
      await this.sb
        .from("messages")
        .insert({ conversation_id: conversationId, role, content, metadata })
        .select("*")
        .single(),
      "save message",
    ) as MessageRow;
    return toMessage(row);
  }

  async updateMessage(_viewerId: string, messageId: string, content: string, metadata?: MessageMetadata) {
    const patch: Record<string, unknown> = { content };
    if (metadata) {
      const current = check(
        await this.sb.from("messages").select("metadata").eq("id", messageId).maybeSingle(),
        "load message",
      ) as { metadata: MessageMetadata } | null;
      if (!current) return false;
      patch.metadata = { ...current.metadata, ...metadata };
    }
    const rows = check(
      await this.sb.from("messages").update(patch).eq("id", messageId).select("id"),
      "update message",
    ) as { id: string }[];
    return rows.length > 0;
  }

  async deleteMessagesAfter(_viewerId: string, conversationId: string, afterSeq: number) {
    check(
      await this.sb.from("messages").delete().eq("conversation_id", conversationId).gt("seq", afterSeq),
      "delete messages",
    );
  }

  async deleteMessage(_viewerId: string, messageId: string) {
    check(await this.sb.from("messages").delete().eq("id", messageId), "delete message");
  }
}
