import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { paymentProvider } from "@/lib/payments";
import { bookingRef } from "@/lib/booking-ref";
import { BRAND } from "@/lib/mockData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payments/checkout  { bookingId }
//
// Creates a PSP checkout for the 20% deposit on a booking. Returns the
// checkout info the frontend widget needs to render the payment UI. Only
// works when PAYMENT_PROVIDER is set to a real provider (default
// "manual" returns 503 so the upload flow stays the active path).
export async function POST(request: Request) {
  const provider = paymentProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Online payments are not enabled" },
      { status: 503 },
    );
  }
  let body: { bookingId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // For a group booking, the 20% deposit is on the WHOLE group's total
  // — sum all sibling rows. For a solo booking it's just this row.
  let totalCents = booking.total_price_cents ?? 0;
  if (booking.booking_group_id) {
    const { data: sibs } = await supabase
      .from("bookings")
      .select("total_price_cents")
      .eq("booking_group_id", booking.booking_group_id);
    totalCents = (sibs ?? []).reduce(
      (s, b) => s + ((b as { total_price_cents: number | null }).total_price_cents ?? 0),
      0,
    );
  }
  if (totalCents <= 0) {
    return NextResponse.json({ error: "Nothing to charge yet" }, { status: 400 });
  }
  // 20% deposit, rounded to whole cents.
  const depositCents = Math.max(1, Math.round(totalCents * 0.2));
  const ref = bookingRef(booking.booking_group_id ?? booking.id);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentamotozadar.com";

  try {
    const result = await provider.createCheckout({
      reference: ref,
      amountCents: depositCents,
      currency: "EUR",
      description: `${BRAND.name} deposit ${ref}`,
      customer: {
        name: booking.customer_name,
        email: booking.customer_email ?? "",
        phone: booking.customer_phone,
      },
      returnUrl: `${siteUrl}/booking/${booking.secret_token}/confirm`,
    });
    return NextResponse.json({
      reference: ref,
      amountCents: depositCents,
      ...result,
    });
  } catch (err) {
    console.error("[/api/payments/checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create checkout" },
      { status: 500 },
    );
  }
}
