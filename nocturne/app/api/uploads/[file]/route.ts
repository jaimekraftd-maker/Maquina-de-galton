import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { MIME_BY_EXT } from "@/lib/images";

export const dynamic = "force-dynamic";

/** Serves avatars uploaded in local mode (Supabase mode uses Storage public URLs). */
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[file]">) {
  const { file } = await ctx.params;
  const match = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.exec(file);
  if (!match) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(process.cwd(), config.localDataDir, "uploads", file));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME_BY_EXT[match[1]],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
