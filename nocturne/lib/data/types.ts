export const CATEGORIES = [
  { id: "anime", label: "Anime" },
  { id: "fantasy", label: "Fantasy" },
  { id: "adventure", label: "Adventure" },
  { id: "romance", label: "Romance" },
  { id: "mystery", label: "Mystery" },
  { id: "sci-fi", label: "Sci-fi" },
  { id: "original", label: "Original" },
  { id: "roleplay", label: "Roleplay" },
  { id: "friendly", label: "Friendly chat" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const SORT_OPTIONS = [
  { id: "popular", label: "Most chatted" },
  { id: "new", label: "Newest" },
  { id: "name", label: "Name (A–Z)" },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]["id"];

export type Visibility = "public" | "private";

/** The editable definition of a character, as authored in the studio. */
export interface CharacterInput {
  name: string;
  tagline: string;
  description: string;
  personality: string;
  traits: string[];
  background: string;
  greeting: string;
  scenario: string;
  exampleDialogue: string;
  speakingStyle: string;
  tags: string[];
  categories: CategoryId[];
  avatarUrl: string | null;
  visibility: Visibility;
}

export interface Character extends CharacterInput {
  id: string;
  creatorId: string | null;
  creatorName: string | null;
  /** Curated demo characters shown in the hero section. */
  featured: boolean;
  /** Real number of conversations started with this character. */
  chatCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CharacterSummary = Pick<
  Character,
  | "id"
  | "name"
  | "tagline"
  | "avatarUrl"
  | "tags"
  | "categories"
  | "chatCount"
  | "creatorId"
  | "creatorName"
  | "visibility"
  | "featured"
  | "createdAt"
>;

export type MessageRole = "user" | "assistant";

export interface MessageMetadata {
  provider?: string;
  model?: string;
  stopReason?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  interrupted?: boolean;
  greeting?: boolean;
  edited?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Monotonic ordering key inside a conversation. */
  seq: number;
  metadata: MessageMetadata;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  characterId: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  lastActivityAt: string;
}

export interface ConversationWithCharacter extends Conversation {
  character: Pick<Character, "id" | "name" | "avatarUrl" | "tagline"> | null;
  lastMessagePreview: string | null;
}

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Viewer {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  /** True when running in the unauthenticated local development mode. */
  isLocal: boolean;
}

export interface CharacterQuery {
  q?: string;
  category?: CategoryId;
  sort?: SortId;
  limit?: number;
}
