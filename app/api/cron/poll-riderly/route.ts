import { NextResponse } from "next/server";
import {
  pollRiderlyInbox,
  mapRiderlyBikeName,
  parseRiderlyDateTime,
  type RiderlyBooking,
} from "@/lib/riderly";
import { sendOwnerRiderlyTelegram } from "@/lib/telegram";
import { sendOwnerRiderlyEmail } from "@/lib/email";
import { getServiceClient } from "@/lib/supabase";

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

  // Persist every Riderly booking as a real row in the bookings table so
  // it shows up in the admin dashboard alongside our own bookings. The
  // Riderly email is anonymised (no rider name / email / phone), so this
  // is a placeholder pending row the owner can flesh out on click. Dedup
  // on the Riderly booking id so re-polling never doubles anything up.
  let inserted = 0;
  for (const email of emails) {
    if (email.kind !== "booking") continue;
    try {
      const res = await upsertRiderlyBookingRow(email.booking);
      if (res === "inserted") inserted++;
    } catch (err) {
      console.error("[cron/poll-riderly] insert failed", err);
    }
  }

  return NextResponse.json({ found: emails.length, forwarded, inserted });
}

// Insert a Riderly booking as a pending row in our bookings table, or
// return "skipped" when a row with the same Riderly id already exists.
// We store the Riderly id inside the notes field ("Riderly: XXX") both
// as a human hint in the admin card AND as our dedupe key. Simple, no
// schema migration needed for a two-a-week integration.
async function upsertRiderlyBookingRow(
  b: RiderlyBooking,
): Promise<"inserted" | "skipped" | "unmapped"> {
  const supabase = getServiceClient();
  const marker = `Riderly: ${b.bookingId}`;

  // Dedup: if any row already carries this Riderly id in its notes, do
  // nothing. Notes is TEXT so we use ilike; the id itself is unique
  // enough that a substring match is safe.
  const existing = await supabase
    .from("bookings")
    .select("id")
    .ilike("notes", `%${marker}%`)
    .limit(1);
  if ((existing.data ?? []).length > 0) return "skipped";

  const bikeId = mapRiderlyBikeName(b.bikeName);
  const start = parseRiderlyDateTime(b.startDate);
  const end = parseRiderlyDateTime(b.endDate);
  // Without any of these three we can't build a schedulable row.
  if (!bikeId || !start || !end) {
    console.warn(
      `[cron/poll-riderly] can't build row for ${b.bookingId}: bikeId=${bikeId}, start=${!!start}, end=${!!end}`,
    );
    return "unmapped";
  }

  // Ridley emails carry no PII up-front — the accept flow reveals it
  // later. Placeholder identity is fine for the dashboard card; the
  // owner can rename after accepting on Riderly.
  const price = b.totalEur ? Math.round(parseFloat(b.totalEur) * 100) : null;
  const notesBlocks = [
    marker,
    b.bikeName ? `Bike (Riderly): ${b.bikeName}` : null,
    b.licenceCategory ? `Licence: ${b.licenceCategory}` : null,
    b.age ? `Age: ${b.age}` : null,
    b.remainingEur ? `Remaining on-site: €${b.remainingEur}` : null,
    b.acceptUrl ? `Accept: ${b.acceptUrl}` : null,
    b.rejectUrl ? `Reject: ${b.rejectUrl}` : null,
  ].filter((s): s is string => Boolean(s));

  const { error } = await supabase.from("bookings").insert({
    bike_id: bikeId,
    customer_name: `Riderly ${b.bookingId}`,
    customer_email: "",
    customer_phone: "",
    notes: notesBlocks.join("\n"),
    date_from: start.date,
    date_to: end.date,
    pickup_time: start.time,
    return_time: end.time,
    total_price_cents: price,
    payment_method: null,
    drivers_licence: null,
    riding_style: null,
    locale: "en",
    status: "pending",
  });
  if (error) {
    console.error("[cron/poll-riderly] insert error", error);
    throw new Error(error.message);
  }
  return "inserted";
}
