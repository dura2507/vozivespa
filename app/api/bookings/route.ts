import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendOwnerBookingTelegram } from "@/lib/telegram";
import { sendCustomerBookingReceivedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

type BookingPayload = {
  bikeId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  from?: unknown; // ISO YYYY-MM-DD
  to?: unknown; // ISO YYYY-MM-DD
  totalPriceCents?: unknown;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asIsoDate(v: unknown): string | null {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

// POST /api/bookings
//
// Creates a pending booking. The owner notification (email / WhatsApp) is a
// later step - for now the booking just lands in the DB with status 'pending'.
export async function POST(request: Request) {
  let body: BookingPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bikeId = asString(body.bikeId);
  const name = asString(body.name);
  const email = asString(body.email);
  const phone = asString(body.phone);
  const notes = asString(body.notes);
  const from = asIsoDate(body.from);
  const to = asIsoDate(body.to);
  const totalPriceCents =
    typeof body.totalPriceCents === "number" && Number.isFinite(body.totalPriceCents)
      ? Math.round(body.totalPriceCents)
      : null;

  if (!bikeId) return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  if (!from || !to) return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });

  const supabase = getServiceClient();

  // 1. Bike must exist and be active
  const { data: bike, error: bikeError } = await supabase
    .from("bikes")
    .select("id, active")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeError) {
    console.error("[/api/bookings] bike lookup error", bikeError);
    return NextResponse.json({ error: "Could not validate bike" }, { status: 500 });
  }
  if (!bike || !bike.active) {
    return NextResponse.json({ error: "Bike not available" }, { status: 404 });
  }

  // 2. No overlap with existing blocked dates
  // Two ranges [from, to] and [df, dt] overlap iff df <= to && dt >= from.
  const { data: overlaps, error: overlapError } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to")
    .eq("bike_id", bikeId)
    .lte("date_from", to)
    .gte("date_to", from)
    .limit(1);
  if (overlapError) {
    console.error("[/api/bookings] overlap lookup error", overlapError);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  if (overlaps && overlaps.length > 0) {
    return NextResponse.json(
      { error: "Selected dates are no longer available" },
      { status: 409 },
    );
  }

  // 3. Insert
  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      bike_id: bikeId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      notes,
      date_from: from,
      date_to: to,
      total_price_cents: totalPriceCents,
    })
    .select("*")
    .single();
  if (insertError || !booking) {
    console.error("[/api/bookings] insert error", insertError);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  // 4. Notifications - run AFTER the response so the customer gets a snappy
  //    'Request sent' UI but the function stays alive long enough to actually
  //    fire telegram + email (Vercel kills detached Promises otherwise).
  const finalBooking = booking as BookingRow;
  after(async () => {
    await Promise.allSettled([
      sendOwnerBookingTelegram(finalBooking),
      sendCustomerBookingReceivedEmail(finalBooking),
    ]);
  });

  return NextResponse.json(
    { id: booking.id, status: booking.status },
    { status: 201 },
  );
}
