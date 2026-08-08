import { NextResponse } from "next/server";
import {
  processRiderlyInbox,
  mapRiderlyBikeName,
  parseRiderlyDateTime,
  type RiderlyBooking,
  type RiderlyCandidate,
  type RiderlyEmail,
} from "@/lib/riderly";
import { sendOwnerRiderlyTelegram } from "@/lib/telegram";
import { sendOwnerRiderlyEmail } from "@/lib/email";
import { getServiceClient } from "@/lib/supabase";
import { zagrebNow } from "@/lib/season";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// IMAP login over TLS to imap.gmail.com can spike hard during cold starts
// or when Gmail throttles: we have measured a 31s connect and a 44s
// mailbox lock on a bad day. The old 60s ceiling was the Hobby-plan
// maximum and it killed the request mid-flight, which is how Riderly
// bookings went missing. On Pro we can give it real headroom.
export const maxDuration = 300;

// GET /api/cron/poll-riderly
//
// Scheduled by Vercel Cron (see vercel.json). Scans the Riderly mailbox,
// forwards fresh notifications to the owner and mirrors every Riderly
// booking into our bookings table so it blocks capacity like our own.
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

  let notified = 0;
  let imported = 0;

  try {
    const stats = await processRiderlyInbox({
      // Match the window we actually characterised on the live mailbox.
      // Reaching further back only surfaces mail nobody has looked at,
      // whose current state on Riderly we cannot know.
      windowDays: 14,
      // Skip the body download when we already know the booking AND the
      // owner has already seen the mail: nothing left to do for it.
      needsBody: async (c: RiderlyCandidate) => {
        if (c.wasUnseen) return true;
        if (!c.bookingId) return false;
        return !(await riderlyBookingKnown(c.bookingId));
      },

      handle: async (email: RiderlyEmail, c: RiderlyCandidate) => {
        let ok = true;

        // 1. Mirror the booking into our calendar. Runs for read mail too,
        //    so a notification that was lost (timeout, crash) still ends up
        //    blocking the right bike.
        let inserted = false;
        if (email.kind === "booking") {
          try {
            const res = await upsertRiderlyBookingRow(email.booking);
            inserted = res === "inserted";
            if (inserted) {
              imported++;
              console.log(`[cron/poll-riderly] imported ${email.booking.bookingId}`);
            }
          } catch (err) {
            console.error("[cron/poll-riderly] insert failed", err);
            ok = false;
          }
        }

        // 2. Tell the owner. Either because the mail is new to them, or
        //    because we just created a booking they never heard about.
        //    Nothing lands in the calendar silently.
        if (c.wasUnseen || inserted) {
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
          for (const r of results) {
            if (r.status === "rejected") {
              console.error("[cron/poll-riderly] notify failed", r.reason);
            }
          }
          // "Resolved" is not the same as "a human was told": the Telegram
          // helper swallows per-chat errors, and the email helper returns
          // early when OWNER_EMAIL / RESEND_API_KEY are unset. So count the
          // Telegram deliveries it actually reports, and only treat email
          // as a channel when it neither threw nor was skipped.
          const tg = results[0];
          const chats = tg.status === "fulfilled" ? (tg.value as number) : 0;
          const mailOk = results[1].status === "fulfilled";
          if (chats > 0 || mailOk) {
            notified++;
          } else {
            console.error(
              `[cron/poll-riderly] nobody notified for uid=${c.uid} (telegram chats=0, email failed)`,
            );
            ok = false;
          }
        }

        return ok;
      },
    });

    return NextResponse.json({ ...stats, notified, imported });
  } catch (err) {
    console.error("[cron/poll-riderly] poll failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "poll failed" },
      { status: 500 },
    );
  }
}

// Cheap "do we already have this Riderly booking?" check by marker.
async function riderlyBookingKnown(bookingId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .ilike("notes", `%Riderly: ${bookingId}%`)
    .limit(1);
  return (data ?? []).length > 0;
}

// Insert a Riderly booking as a pending row in our bookings table, or
// return "skipped" when we already have it. The Riderly id lives inside
// the notes field ("Riderly: XXX") both as a human hint in the admin card
// AND as our dedupe key. Simple, no schema migration needed for a
// two-a-week integration.
async function upsertRiderlyBookingRow(
  b: RiderlyBooking,
): Promise<"inserted" | "skipped" | "unmapped"> {
  const supabase = getServiceClient();
  const marker = `Riderly: ${b.bookingId}`;

  // Dedupe 1: the marker. Covers everything this importer created itself.
  if (await riderlyBookingKnown(b.bookingId)) return "skipped";

  const bikeId = mapRiderlyBikeName(b.bikeName);
  const start = parseRiderlyDateTime(b.startDate);
  const end = parseRiderlyDateTime(b.endDate);
  // Without any of these three we can't build a schedulable row.
  if (!bikeId || !start || !end) {
    // Loud on purpose: this is the one path where a real Riderly booking
    // reaches us and still does not block a bike. It shows up in the Vercel
    // ERROR log so it can be caught, instead of a warn line nobody reads.
    console.error(
      `[cron/poll-riderly] UNMAPPED Riderly booking ${b.bookingId}: bike="${b.bikeName}" -> ${bikeId}, start=${b.startDate}, end=${b.endDate}. Needs manual entry.`,
    );
    return "unmapped";
  }

  // Don't resurrect history. A rental that has already ended blocks
  // nothing useful and would just be noise in the dashboard; a mail that
  // old only shows up here because its row was lost, and re-creating it
  // months later helps nobody.
  // Compare the full end MOMENT, not just the date, and do it in Zagreb
  // wallclock (the function runs on a UTC box, so a naive Date would be two
  // hours off). A day-level check let 6CVZRKBW52 through on 2026-08-08: it
  // had ended that same morning at 10:00, so it was already history when
  // the cron saw it, yet it landed as a fresh pending request.
  const now = zagrebNow();
  const [endH, endMin] = end.time.split(":").map((n) => parseInt(n, 10));
  const endMinutes = endH * 60 + endMin;
  const isOver =
    end.date < now.isoDate ||
    (end.date === now.isoDate && endMinutes <= now.minutesOfDay);
  if (isOver) {
    console.log(
      `[cron/poll-riderly] ${b.bookingId} already over (${end.date} ${end.time}), not importing`,
    );
    return "skipped";
  }

  // Dedupe 2: the same rental already sits in the calendar because a human
  // typed it in. That row carries the real rider name and NO marker (James
  // Woodyear-Smith / RHIJ6FNB3M was exactly this), so dedupe 1 cannot see
  // it and we would block the same bike twice.
  //
  // Crucially this only looks at rows WITHOUT a "Riderly: " marker, i.e.
  // hand-entered ones. Matching importer-created rows too would be wrong:
  // the fleet is not unit-pinned, so two DIFFERENT Riderly bookings for the
  // same model and window are legitimate (that is what having K units
  // means) - and within a single run the row just inserted for booking A
  // would silently swallow booking B.
  const twin = await supabase
    .from("bookings")
    .select("id, customer_name, notes")
    .eq("bike_id", bikeId)
    .eq("date_from", start.date)
    .eq("date_to", end.date)
    .eq("pickup_time", start.time)
    .eq("return_time", end.time)
    .neq("status", "cancelled")
    .limit(20);
  // The "no marker" test runs here rather than as a PostgREST `or` filter:
  // the result set is tiny and a plain JS check cannot be tripped up by
  // filter-string escaping.
  const twinRow = ((twin.data ?? []) as Array<{
    id: string;
    customer_name: string;
    notes: string | null;
  }>).find((r) => !/Riderly:/i.test(r.notes ?? ""));
  if (twinRow) {
    console.log(
      `[cron/poll-riderly] ${b.bookingId} already covered by hand-entered booking "${twinRow.customer_name}" (${bikeId} ${start.date} ${start.time})`,
    );
    return "skipped";
  }

  // Riderly emails carry no PII up-front — the accept flow reveals it
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
