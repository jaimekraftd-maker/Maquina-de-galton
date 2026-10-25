import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/http";
import { stopGeneration } from "@/lib/chat/generations";
import { getContext } from "@/lib/data";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const { viewer } = await getContext();
  if (!viewer) return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { conversationId?: unknown } | null;
  const id = uuidSchema.safeParse(body?.conversationId);
  if (!id.success) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  return NextResponse.json({ stopped: stopGeneration(id.data, viewer.id) });
}
