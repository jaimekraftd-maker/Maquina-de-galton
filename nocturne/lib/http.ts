import { NextResponse } from "next/server";

/**
 * Rejects cross-site requests to state-changing API routes (defence in depth on
 * top of SameSite cookies). Browsers always send Origin on cross-origin POSTs.
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    // malformed Origin header
  }
  return NextResponse.json({ error: "Cross-site request rejected.", code: "forbidden" }, { status: 403 });
}
