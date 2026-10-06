import { NextResponse } from "next/server";
import { fileDownloadUrl } from "@/lib/telegram-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/telegram-file?id=<file_id>
// Streams a photo / voice memo / document from the Telegram inbox to the
// admin, so the bot token never reaches the browser. Admin-only: proxy.ts
// gates every /api/admin/* route behind the session cookie.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const src = await fileDownloadUrl(id);
  if (!src) return NextResponse.json({ error: "file not found or bot not configured" }, { status: 404 });
  const upstream = await fetch(src);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "download failed" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}
