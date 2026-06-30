import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { paymentProvider } from "@/lib/payments";
import { bookingRef } from "@/lib/booking-ref";

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
        const { error: upErr } = await supabase
          .from("bookings")
          .update({
            status: "confirmed",
            decided_at: new Date().toISOString(),
            payment_method: "revolut", // closest existing value; refine when activating
          })
          .in("id", ids);
        if (upErr) {
          console.error("[/api/payments/webhook] confirm update", upErr);
          return;
        }
        console.log(
          `[/api/payments/webhook] confirmed ${ids.length} booking(s) for ${event.reference}`,
        );
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
