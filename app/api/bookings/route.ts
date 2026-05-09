import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendOwnerBookingTelegram } from "@/lib/telegram";
import { sendCustomerBookingReceivedEmail } from "@/lib/email";
import { isValidSlot, parseTime, TURNAROUND_MINUTES } from "@/lib/pricing";

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

  // 2. Overlap check.
  //    - Manual blocks (booking_id null in blocked_dates) are full-day:
  //      any date overlap rejects.
  //    - Confirmed bookings overlap by datetime so back-to-back pickups
  //      on a shared day are allowed when the times don't actually clash
  //      (e.g. existing returns 15.05 14:00, new picks up 15.05 14:30).
  const { data: manualBlocks, error: manualErr } = await supabase
    .from("blocked_dates")
    .select("id")
    .eq("bike_id", bikeId)
    .is("booking_id", null)
    .lte("date_from", to)
    .gte("date_to", from)
    .limit(1);
  if (manualErr) {
    console.error("[/api/bookings] manual block lookup error", manualErr);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  if (manualBlocks && manualBlocks.length > 0) {
    return NextResponse.json(
      { error: "Selected dates are no longer available" },
      { status: 409 },
    );
  }

  const { data: candidates, error: candErr } = await supabase
    .from("bookings")
    .select("date_from, date_to, pickup_time, return_time")
    .eq("bike_id", bikeId)
    .eq("status", "confirmed")
    .lte("date_from", to)
    .gte("date_to", from);
  if (candErr) {
    console.error("[/api/bookings] booking overlap lookup error", candErr);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  const toMs = (date: string, time: string) => {
    const t = time.length === 5 ? `${time}:00` : time;
    return new Date(`${date}T${t}`).getTime();
  };
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const newStart = toMs(from, pickupTime);
  const newEnd = toMs(to, returnTime);
  for (const b of candidates ?? []) {
    const bStart = toMs(b.date_from, b.pickup_time);
    const bEnd = toMs(b.date_to, b.return_time);
    // 1-hour turnaround buffer: new pickup must be ≥ existing return +
    // buffer, new return must be ≤ existing pickup - buffer. Owner uses
    // that hour to receive, check and prep the bike.
    if (newStart < bEnd + bufferMs && bStart - bufferMs < newEnd) {
      return NextResponse.json(
        {
          error: `Time conflict with another booking - we need ${TURNAROUND_MINUTES} minutes between bookings to check and prep the bike. Try a later pickup or earlier return time.`,
        },
        { status: 409 },
      );
    }
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
