import { z } from "zod";
import { CATEGORY_IDS } from "@/lib/data/types";

export const LIMITS = {
  name: 60,
  tagline: 140,
  description: 4000,
  personality: 4000,
  background: 6000,
  greeting: 2000,
  scenario: 2000,
  exampleDialogue: 4000,
  speakingStyle: 1000,
  trait: 30,
  traits: 10,
  tag: 24,
  tags: 12,
  categories: 3,
  message: 8000,
  title: 100,
  avatarBytes: 2 * 1024 * 1024,
} as const;

const trimmed = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters`);
const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `Must be at most ${max} characters`);

/**
 * Avatar URLs may be a built-in portrait, an uploaded file served by this app,
 * or an external https image. Anything else (javascript:, data:, http:) is rejected.
 */
export const avatarUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => {
      if (/^\/(characters|api\/uploads)\/[\w.\-/]+$/.test(v) && !v.includes("..")) return true;
      try {
        const url = new URL(v);
        return url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Use an https:// image URL or upload a file" },
  );

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(LIMITS.tag, `Tags must be at most ${LIMITS.tag} characters`)
  .regex(/^[\p{L}\p{N} '&\-]+$/u, "Tags may contain letters, numbers, spaces and dashes");

export const characterInputSchema = z.object({
  name: required("Name", LIMITS.name),
  tagline: required("Short description", LIMITS.tagline),
  description: required("Description", LIMITS.description),
  personality: required("Personality", LIMITS.personality),
  traits: z
    .array(z.string().trim().min(1).max(LIMITS.trait, `Traits must be at most ${LIMITS.trait} characters`))
    .max(LIMITS.traits, `At most ${LIMITS.traits} traits`)
    .default([]),
  background: trimmed(LIMITS.background).default(""),
  greeting: required("Greeting", LIMITS.greeting),
  scenario: trimmed(LIMITS.scenario).default(""),
  exampleDialogue: trimmed(LIMITS.exampleDialogue).default(""),
  speakingStyle: trimmed(LIMITS.speakingStyle).default(""),
  tags: z
    .array(tagSchema)
    .max(LIMITS.tags, `At most ${LIMITS.tags} tags`)
    .default([])
    .transform((tags) => Array.from(new Set(tags))),
  categories: z
    .array(z.enum(CATEGORY_IDS))
    .min(1, "Pick at least one category")
    .max(LIMITS.categories, `Pick at most ${LIMITS.categories} categories`)
    .transform((c) => Array.from(new Set(c))),
  avatarUrl: avatarUrlSchema.nullable().default(null),
  visibility: z.enum(["public", "private"]).default("public"),
});

export type CharacterInputParsed = z.output<typeof characterInputSchema>;

export const uuidSchema = z.string().uuid();

export const chatRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("send"),
    conversationId: uuidSchema,
    content: required("Message", LIMITS.message),
  }),
  z.object({
    mode: z.literal("regenerate"),
    conversationId: uuidSchema,
  }),
  z.object({
    mode: z.literal("retry"),
    conversationId: uuidSchema,
  }),
  z.object({
    mode: z.literal("edit"),
    conversationId: uuidSchema,
    messageId: uuidSchema,
    content: required("Message", LIMITS.message),
  }),
]);

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const signUpSchema = credentialsSchema.extend({
  displayName: required("Display name", 40),
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
