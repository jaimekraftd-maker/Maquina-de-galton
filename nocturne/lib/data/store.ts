import type {
  Character,
  CharacterInput,
  CharacterQuery,
  CharacterSummary,
  Conversation,
  ConversationWithCharacter,
  Message,
  MessageMetadata,
  MessageRole,
} from "./types";

/**
 * Persistence boundary. Every method that touches private data receives the
 * acting user's id and must only return / mutate rows that user may access.
 * The Supabase implementation additionally relies on Row Level Security, so
 * these checks are defence in depth there.
 */
export interface DataStore {
  // Characters
  searchCharacters(viewerId: string | null, query: CharacterQuery): Promise<CharacterSummary[]>;
  getCharacter(viewerId: string | null, id: string): Promise<Character | null>;
  listCharactersByCreator(viewerId: string): Promise<CharacterSummary[]>;
  createCharacter(viewerId: string, input: CharacterInput): Promise<Character>;
  updateCharacter(viewerId: string, id: string, input: CharacterInput): Promise<Character | null>;
  deleteCharacter(viewerId: string, id: string): Promise<boolean>;

  // Favorites
  listFavorites(viewerId: string): Promise<CharacterSummary[]>;
  isFavorite(viewerId: string, characterId: string): Promise<boolean>;
  setFavorite(viewerId: string, characterId: string, favorite: boolean): Promise<void>;

  // Conversations
  listConversations(viewerId: string, limit?: number): Promise<ConversationWithCharacter[]>;
  getConversation(viewerId: string, id: string): Promise<Conversation | null>;
  latestConversationFor(viewerId: string, characterId: string): Promise<Conversation | null>;
  createConversation(viewerId: string, characterId: string, title: string): Promise<Conversation>;
  updateConversation(
    viewerId: string,
    id: string,
    patch: Partial<Pick<Conversation, "title" | "pinned">>,
  ): Promise<boolean>;
  deleteConversation(viewerId: string, id: string): Promise<boolean>;

  // Messages
  listMessages(viewerId: string, conversationId: string): Promise<Message[]>;
  addMessage(
    viewerId: string,
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: MessageMetadata,
  ): Promise<Message>;
  updateMessage(
    viewerId: string,
    messageId: string,
    content: string,
    metadata?: MessageMetadata,
  ): Promise<boolean>;
  /** Deletes every message whose seq is strictly greater than `afterSeq`. */
  deleteMessagesAfter(viewerId: string, conversationId: string, afterSeq: number): Promise<void>;
  deleteMessage(viewerId: string, messageId: string): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}
