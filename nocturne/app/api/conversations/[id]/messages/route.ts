import { NextResponse } from "next/server";
import { getContext } from "@/lib/data";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const { id } = await ctx.params;
  const { store, viewer } = await getContext();
  if (!viewer) return NextResponse.json({ error: "Sign in to view conversations." }, { status: 401 });
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const conversation = await store.getConversation(viewer.id, id);
  if (!conversation) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const messages = await store.listMessages(viewer.id, id);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
