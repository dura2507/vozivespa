import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { paymentProvider } from "@/lib/payments";
import { bookingRef } from "@/lib/booking-ref";
import {
  sendCustomerBookingDecidedEmail,
  sendCustomerGroupBookingDecidedEmail,
} from "@/lib/email";
import { sendOwnerBookingTelegram, sendOwnerGroupBookingTelegram } from "@/lib/telegram";
import { getBikeUnitLabel } from "@/lib/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payments/webhook?token=<PAYMENT_WEBHOOK_SECRET>
//
// PSP webhook handler. SumUp doesn't sign webhooks, so the only thing
// protecting this endpoint is a secret query parameter we register with
// SumUp when we set the webhook URL. Anyone hitting the URL without it
// gets 401 and nothing happens.
//
// On a "paid" event we promote pending bookings sharing the reference to
// confirmed. We never DOWNGRADE a confirmed booking from a webhook —
// that path stays manual via the admin actions.
export async function POST(request: Request) {
  const provider = paymentProvider();
  if (!provider) {
    return NextResponse.json({ ok: true, ignored: "no provider" });
  }

  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[/api/payments/webhook] PAYMENT_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const url = new URL(request.url);
  const provided = url.searchParams.get("token");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = await provider.parseWebhook(
      rawBody,
      Object.fromEntries(request.headers.entries()),
    );
  } catch (err) {
    console.error("[/api/payments/webhook] parse", err);
    return NextResponse.json({ error: "Bad webhook payload" }, { status: 400 });
  }

  // Ack the webhook immediately and do the booking update in the
  // background — PSPs retry slow webhooks, which would double-process.
  after(async () => {
    try {
      const supabase = getServiceClient();
      const { data: candidates, error } = await supabase
        .from("bookings")
        .select("*")
        .in("status", ["pending"]);
      if (error) {
        console.error("[/api/payments/webhook] lookup", error);
        return;
      }
      // Find the booking(s) whose ref matches the event. Linear scan is
      // fine because pending is a small set; we don't have an index on
      // the derived ref. For a group, every sibling row shares the ref.
      const matches = (candidates ?? []).filter(
        (b) => bookingRef((b as BookingRow).booking_group_id ?? (b as BookingRow).id) === event.reference,
      ) as BookingRow[];
      if (matches.length === 0) {
        console.warn("[/api/payments/webhook] no booking for ref", event.reference);
        return;
      }

      if (event.status === "paid") {
        const ids = matches.map((b) => b.id);
        // Idempotent update: only rows still pending flip to confirmed.
        // If /api/payments/verify already promoted them, we get zero rows
        // back and skip the mails — no duplicate notifications on the
        // widget-success → webhook race that the SumUp docs warn about.
        const { data: promoted, error: upErr } = await supabase
          .from("bookings")
          .update({
            status: "confirmed",
            decided_at: new Date().toISOString(),
            payment_method: "revolut", // closest existing value; refine when activating
          })
          .in("id", ids)
          .eq("status", "pending")
          .select("id");
        if (upErr) {
          console.error("[/api/payments/webhook] confirm update", upErr);
          return;
        }
        const changedIds = (promoted ?? []).map((r) => (r as { id: string }).id);
        console.log(
          `[/api/payments/webhook] promoted ${changedIds.length} of ${ids.length} booking(s) for ${event.reference}`,
        );
        if (changedIds.length === 0) return;
        try {
          const { data: fresh } = await supabase
            .from("bookings")
            .select("*")
            .in("id", changedIds);
          const rows = (fresh ?? []) as BookingRow[];
          if (rows.length === 1) {
            const single = rows[0];
            await sendCustomerBookingDecidedEmail(single, "confirmed");
            const unitLabel = await getBikeUnitLabel(supabase, single.bike_unit_id).catch(() => null);
            // Persist the message refs like the request-flow path does —
            // without them the owner card can never be status-synced later.
            const refs = await sendOwnerBookingTelegram(single, undefined, unitLabel);
            if (refs.length > 0) {
              await supabase
                .from("bookings")
                .update({ telegram_message_refs: refs })
                .eq("id", single.id);
            }
          } else if (rows.length > 1) {
            await sendCustomerGroupBookingDecidedEmail(rows, "confirmed");
            const refs = await sendOwnerGroupBookingTelegram(rows);
            if (refs.length > 0 && rows[0].booking_group_id) {
              await supabase
                .from("bookings")
                .update({ telegram_message_refs: refs })
                .eq("booking_group_id", rows[0].booking_group_id);
            }
          }
        } catch (notifyErr) {
          console.error("[/api/payments/webhook] notify", notifyErr);
        }
      } else if (event.status === "failed" || event.status === "cancelled") {
        // We don't auto-decline on failed payment — the customer can
        // retry, and the owner can still manually accept on a different
        // payment path. Just log.
        console.log(
          `[/api/payments/webhook] ${event.status} for ${event.reference}, leaving pending`,
        );
      }
    } catch (err) {
      console.error("[/api/payments/webhook] background", err);
    }
  });

  return NextResponse.json({ ok: true });
}
