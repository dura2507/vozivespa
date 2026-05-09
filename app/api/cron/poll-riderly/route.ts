import { NextResponse } from "next/server";
import { pollRiderlyInbox } from "@/lib/riderly";
import { sendOwnerRiderlyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/poll-riderly
//
// Scheduled by Vercel Cron (see vercel.json). Pulls every unseen
// message from the configured Riderly mailbox, forwards each one to
// the owner's Telegram and marks them as read so the next tick only
// sees fresh notifications.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We
// reject anything without that header so the endpoint can't be hit
// from the open internet.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let emails;
  try {
    emails = await pollRiderlyInbox();
  } catch (err) {
    console.error("[cron/poll-riderly] poll failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "poll failed" },
      { status: 500 },
    );
  }

  let forwarded = 0;
  for (const email of emails) {
    try {
      await sendOwnerRiderlyTelegram(email);
      forwarded++;
    } catch (err) {
      console.error("[cron/poll-riderly] telegram forward failed", err);
    }
  }

  return NextResponse.json({ found: emails.length, forwarded });
}
