import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// POST /api/track . body {path, locale?, referrer?}
//
// Privacy-friendly hit counter. We never store the raw IP or
// user-agent: they're hashed together with today's UTC date so we
// can count unique visitors per day without keeping anything that
// could re-identify someone. The hash rotates at UTC midnight.
export async function POST(request: Request) {
  let body: { path?: unknown; locale?: unknown; referrer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 200) : null;
  if (!path || path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }
  const locale = typeof body.locale === "string" ? body.locale.slice(0, 8) : null;
  const referrer =
    typeof body.referrer === "string" && body.referrer.length > 0
      ? body.referrer.slice(0, 500)
      : null;

  // Country / IP come from Vercel headers. Forwarded chain header is
  // used as the IP source so we don't trust client-supplied values.
  const country = request.headers.get("x-vercel-ip-country") ?? null;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ua = request.headers.get("user-agent") ?? "unknown";
  const utcDay = new Date().toISOString().slice(0, 10);
  const sessionHash = createHash("sha256")
    .update(`${ip}|${ua}|${utcDay}`)
    .digest("hex")
    .slice(0, 32);

  const supabase = getServiceClient();
  const { error } = await supabase.from("page_views").insert({
    path,
    locale,
    country,
    referrer,
    session_hash: sessionHash,
  });
  if (error) {
    console.error("[/api/track] insert error", error);
    return NextResponse.json({ error: "track failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
