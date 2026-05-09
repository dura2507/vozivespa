import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendOwnerBookingTelegram } from "@/lib/telegram";
import { sendCustomerBookingReceivedEmail } from "@/lib/email";
import { isValidSlot, parseTime } from "@/lib/pricing";
import { describeConflict, findOverlap } from "@/lib/availability";

export const dynamic = "force-dynamic";

type BookingPayload = {
  bikeId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  from?: unknown; // ISO YYYY-MM-DD
  to?: unknown; // ISO YYYY-MM-DD
  pickupTime?: unknown; // HH:MM, 09:00–19:00, 30-min slots
  returnTime?: unknown;
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

function asSlot(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return isValidSlot(v) ? v : null;
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
  const pickupTime = asSlot(body.pickupTime);
  const returnTime = asSlot(body.returnTime);
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
  if (!pickupTime || !returnTime) {
    return NextResponse.json(
      { error: "Pickup and return times must be 09:00–19:00 in 30-minute slots" },
      { status: 400 },
    );
  }
  if (from === to && parseTime(pickupTime)! >= parseTime(returnTime)!) {
    return NextResponse.json(
      { error: "Return time must be later than pickup time on a same-day booking" },
      { status: 400 },
    );
  }

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

  // 2. Overlap check (manual blocks full-day, confirmed bookings
  //    time-aware with 1h turnaround buffer). Same helper is used at
  //    confirm-time so a second pending booking can't sneak through
  //    while the first is still pending.
  let conflict;
  try {
    conflict = await findOverlap(supabase, {
      bikeId,
      dateFrom: from,
      dateTo: to,
      pickupTime,
      returnTime,
    });
  } catch (err) {
    console.error("[/api/bookings] overlap lookup error", err);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  if (conflict) {
    const message =
      conflict.kind === "manual"
        ? "Selected dates are no longer available"
        : "Time conflict with another booking - we need 1h between bookings to check the bike. Try a later pickup or earlier return time.";
    return NextResponse.json({ error: message, detail: describeConflict(conflict) }, { status: 409 });
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
      pickup_time: pickupTime,
      return_time: returnTime,
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
