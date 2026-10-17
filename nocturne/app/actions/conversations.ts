"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import { LIMITS, uuidSchema } from "@/lib/validation";
import type { ActionResult } from "./characters";

/** Starts a new conversation (seeded with the character's greeting) and opens it. */
export async function startConversation(characterId: string): Promise<ActionResult> {
  const { store, viewer } = await getContext();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/characters/${characterId}`)}`);
  if (!uuidSchema.safeParse(characterId).success) return { ok: false, error: "Character not found." };

  const character = await store.getCharacter(viewer.id, characterId);
  if (!character) return { ok: false, error: "Character not found." };

  let conversationId: string;
  try {
    const conversation = await store.createConversation(viewer.id, character.id, `Chat with ${character.name}`.slice(0, 100));
    await store.addMessage(viewer.id, conversation.id, "assistant", character.greeting, { greeting: true });
    conversationId = conversation.id;
  } catch (err) {
    console.error("[conversations] start failed:", err);
    return { ok: false, error: "Couldn't start the conversation. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/chat/${conversationId}`);
}

export async function deleteConversation(id: string): Promise<ActionResult> {
  const { store, viewer } = await getContext();
  if (!viewer) return { ok: false, error: "Sign in first." };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Conversation not found." };
  try {
    if (!(await store.deleteConversation(viewer.id, id))) return { ok: false, error: "Conversation not found." };
  } catch (err) {
    console.error("[conversations] delete failed:", err);
    return { ok: false, error: "Couldn't delete the conversation." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateConversation(
  id: string,
  patch: { pinned?: boolean; title?: string },
): Promise<ActionResult> {
  const { store, viewer } = await getContext();
  if (!viewer) return { ok: false, error: "Sign in first." };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Conversation not found." };
  const clean: { pinned?: boolean; title?: string } = {};
  if (typeof patch.pinned === "boolean") clean.pinned = patch.pinned;
  if (typeof patch.title === "string") {
    const title = patch.title.trim().slice(0, LIMITS.title);
    if (!title) return { ok: false, error: "Title can't be empty." };
    clean.title = title;
  }
  try {
    if (!(await store.updateConversation(viewer.id, id, clean))) return { ok: false, error: "Conversation not found." };
  } catch (err) {
    console.error("[conversations] update failed:", err);
    return { ok: false, error: "Couldn't update the conversation." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
