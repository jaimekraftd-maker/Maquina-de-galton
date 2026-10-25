import "server-only";

interface Active {
  userId: string;
  controller: AbortController;
}

// One in-flight generation per conversation (per server instance). Survives hot reloads.
const g = globalThis as unknown as { __nocturneGenerations?: Map<string, Active> };
const active = (g.__nocturneGenerations ??= new Map());

/** Returns an AbortController for the generation, or null if one is already running. */
export function beginGeneration(conversationId: string, userId: string): AbortController | null {
  if (active.has(conversationId)) return null;
  const controller = new AbortController();
  active.set(conversationId, { userId, controller });
  return controller;
}

export function endGeneration(conversationId: string, controller: AbortController) {
  if (active.get(conversationId)?.controller === controller) active.delete(conversationId);
}

/** Stops a running generation owned by `userId`. Returns false if none was found. */
export function stopGeneration(conversationId: string, userId: string): boolean {
  const entry = active.get(conversationId);
  if (!entry || entry.userId !== userId) return false;
  entry.controller.abort();
  return true;
}
