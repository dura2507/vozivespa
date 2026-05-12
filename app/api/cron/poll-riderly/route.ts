import { NextResponse } from "next/server";
import { pollRiderlyInbox } from "@/lib/riderly";
import { sendOwnerRiderlyTelegram } from "@/lib/telegram";
import { sendOwnerRiderlyEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// IMAP login over TLS to imap.gmail.com can spike past Hobby's 10s
// default during cold starts. Bump to the Hobby ceiling so we get
// real errors instead of opaque 504 timeouts.
export const maxDuration = 60;

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
    // Fan out to Telegram + Email in parallel. Either side can fail
    // independently — we still count the email as forwarded if at
    // least one channel went through, so a flaky Resend day doesn't
    // make the inbox pile up.
    const results = await Promise.allSettled([
      sendOwnerRiderlyTelegram(email),
      sendOwnerRiderlyEmail(
        email.kind === "booking"
          ? {
              kind: "booking",
              receivedAt: email.receivedAt,
              booking: {
                bookingId: email.booking.bookingId,
                bikeName: email.booking.bikeName,
                startDate: email.booking.startDate,
                endDate: email.booking.endDate,
                totalEur: email.booking.totalEur,
                acceptUrl: email.booking.acceptUrl,
                rejectUrl: email.booking.rejectUrl,
                inboxUrl: email.booking.inboxUrl,
              },
            }
          : {
              kind: "other",
              receivedAt: email.receivedAt,
              subject: email.subject,
              from: email.from,
              preview: email.preview,
              riderlyUrl: email.riderlyUrl,
            },
      ),
    ]);
    if (results.some((r) => r.status === "fulfilled")) forwarded++;
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[cron/poll-riderly] forward failed", r.reason);
      }
    }
  }

  return NextResponse.json({ found: emails.length, forwarded });
}
