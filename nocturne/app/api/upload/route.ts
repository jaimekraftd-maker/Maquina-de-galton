import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/http";
import { config } from "@/lib/config";
import { getContext } from "@/lib/data";
import { IMAGE_TYPES, sniffImageType } from "@/lib/images";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";

const error = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const { viewer, mode } = await getContext();
  if (!viewer) return error(401, "Sign in to upload images.");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > LIMITS.avatarBytes + 64 * 1024) return error(413, "Images must be 2 MB or smaller.");

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return error(400, "Expected a multipart form with a 'file' field.");
  }
  if (!(file instanceof File)) return error(400, "No file received.");
  if (file.size === 0) return error(400, "The file is empty.");
  if (file.size > LIMITS.avatarBytes) return error(413, "Images must be 2 MB or smaller.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) return error(415, "Only PNG, JPEG, WebP and GIF images are supported.");
  const name = `${randomUUID()}.${IMAGE_TYPES[mime]}`;

  if (mode === "local") {
    const dir = path.join(process.cwd(), config.localDataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), bytes);
    return NextResponse.json({ url: `/api/uploads/${name}` });
  }

  const sb = await createSupabaseServerClient();
  const objectPath = `${viewer.id}/${name}`;
  const { error: uploadError } = await sb.storage
    .from("avatars")
    .upload(objectPath, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (uploadError) {
    console.error("[upload] storage error:", uploadError.message);
    return error(500, "Upload failed. Please try again.");
  }
  const { data } = sb.storage.from("avatars").getPublicUrl(objectPath);
  return NextResponse.json({ url: data.publicUrl });
}
