"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { characterInputSchema, fieldErrors, uuidSchema } from "@/lib/validation";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveCharacter(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { store, viewer } = await getContext();
  if (!viewer) return { ok: false, error: "Sign in to create characters." };

  const parsed = characterInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  try {
    if (id) {
      if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Character not found." };
      const updated = await store.updateCharacter(viewer.id, id, parsed.data);
      if (!updated) return { ok: false, error: "You can only edit characters you created." };
      revalidatePath("/", "layout");
      return { ok: true, data: { id: updated.id } };
    }
    const created = await store.createCharacter(viewer.id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    console.error("[characters] save failed:", err);
    return { ok: false, error: "Couldn't save the character. Please try again." };
  }
}

export async function duplicateCharacter(id: string): Promise<ActionResult<{ id: string }>> {
  const { store, viewer } = await getContext();
  if (!viewer) return { ok: false, error: "Sign in to duplicate characters." };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Character not found." };
  const source = await store.getCharacter(viewer.id, id);
  if (!source || source.creatorId !== viewer.id) return { ok: false, error: "You can only duplicate your own characters." };

  const copyName = `${source.name} (copy)`.slice(0, 60);
  const parsed = characterInputSchema.safeParse({ ...source, name: copyName, visibility: "private" });
  if (!parsed.success) return { ok: false, error: "This character can't be duplicated." };
  try {
    const created = await store.createCharacter(viewer.id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    console.error("[characters] duplicate failed:", err);
    return { ok: false, error: "Couldn't duplicate the character." };
  }
}

export async function deleteCharacter(id: string): Promise<ActionResult> {
  const { store, viewer } = await getContext();
  if (!viewer) return { ok: false, error: "Sign in first." };
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Character not found." };
  try {
    const deleted = await store.deleteCharacter(viewer.id, id);
    if (!deleted) return { ok: false, error: "You can only delete characters you created." };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[characters] delete failed:", err);
    return { ok: false, error: "Couldn't delete the character." };
  }
}

export async function setFavorite(characterId: string, favorite: boolean): Promise<ActionResult> {
  const { store, viewer } = await getContext();
  if (!viewer) return { ok: false, error: "Sign in to save favorites." };
  if (!uuidSchema.safeParse(characterId).success) return { ok: false, error: "Character not found." };
  try {
    await store.setFavorite(viewer.id, characterId, favorite);
    revalidatePath("/library");
    return { ok: true };
  } catch (err) {
    console.error("[favorites] update failed:", err);
    return { ok: false, error: "Couldn't update favorites." };
  }
}
