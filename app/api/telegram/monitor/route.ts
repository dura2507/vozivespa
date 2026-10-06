import { NextResponse } from "next/server";
import {
  listInbox,
  markDone,
  monitorSecret,
  secretMatches,
  storeUpdate,
  type TgUpdate,
} from "@/lib/telegram-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook target for the Krileo MONITORING bot (not the owner bot, which has
// its own route at /api/telegram/webhook). See lib/telegram-inbox.ts for why.
//
// POST   Telegram delivery. Authenticated by X-Telegram-Bot-Api-Secret-Token.
//        Stored row -> 200. DB failure -> 500 so Telegram retries later.
//        Unparseable body -> 200 so a poison update can't block the queue.
// GET    ?secret=...&all=1   JSON list of open (or all) rows, for "check tele"
//        from a terminal without touching getUpdates.
// PATCH  { secret, ids: number[], done?: boolean }   mark rows done/open.

export async function POST(request: Request) {
  if (!monitorSecret()) {
    // Env var not set yet: refuse so Telegram keeps the update queued and
    // redelivers once the deployment has the token.
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true, ignored: "bad json" });
  }
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ ok: true, ignored: "no update_id" });
  }
  try {
    await storeUpdate(update);
  } catch (err) {
    console.error("[telegram/monitor] store failed", err);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!secretMatches(url.searchParams.get("secret"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const all = url.searchParams.get("all") === "1";
  try {
    const rows = await listInbox({ onlyOpen: !all, limit: 300 });
    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (err) {
    console.error("[telegram/monitor] list failed", err);
    return NextResponse.json({ error: "list failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let body: { secret?: unknown; ids?: unknown; done?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!secretMatches(typeof body.secret === "string" ? body.secret : null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => typeof x === "number") : [];
  const done = body.done !== false;
  try {
    const n = await markDone(ids, done);
    return NextResponse.json({ ok: true, updated: n });
  } catch (err) {
    console.error("[telegram/monitor] markDone failed", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
