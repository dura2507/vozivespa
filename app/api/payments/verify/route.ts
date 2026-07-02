import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { paymentProvider } from "@/lib/payments";
import { bookingRef } from "@/lib/booking-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payments/verify  { bookingId, checkoutId }
//
// Called by the payment widget after it reports "success". The SDK's
// success callback is NOT proof of payment, so we re-read the checkout
// from the PSP here and only confirm the booking when the PSP says PAID.
// The webhook is the belt-and-braces backup for this same transition.
export async function POST(request: Request) {
  const provider = paymentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Online payments are not enabled" }, { status: 503 });
  }
  let body: { bookingId?: unknown; checkoutId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  const checkoutId = typeof body.checkoutId === "string" ? body.checkoutId : "";
  if (!bookingId || !checkoutId) {
    return NextResponse.json({ error: "bookingId and checkoutId are required" }, { status: 400 });
  }

  let statusResult;
  try {
    statusResult = await provider.getCheckoutStatus(checkoutId);
  } catch (err) {
    console.error("[/api/payments/verify] status", err);
    return NextResponse.json({ error: "Could not verify payment" }, { status: 502 });
  }
  if (statusResult.status !== "paid") {
    return NextResponse.json({ paid: false, status: statusResult.status });
  }

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const ref = bookingRef(booking.booking_group_id ?? booking.id);
  // Confirm every row that shares this booking's reference (a group pays
  // one deposit for all its bikes). Never downgrade an already-confirmed
  // row — we only promote pending → confirmed.
  const groupFilter = booking.booking_group_id
    ? supabase.from("bookings").select("id").eq("booking_group_id", booking.booking_group_id)
    : supabase.from("bookings").select("id").eq("id", booking.id);
  const { data: rows } = await groupFilter;
  const ids = (rows ?? []).map((r) => (r as { id: string }).id);

  const { error: upErr } = await supabase
    .from("bookings")
    .update({ status: "confirmed", decided_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending");
  if (upErr) {
    console.error("[/api/payments/verify] confirm", upErr);
    return NextResponse.json({ error: "Could not confirm booking" }, { status: 500 });
  }
  return NextResponse.json({ paid: true, reference: ref, confirmed: ids.length });
}
