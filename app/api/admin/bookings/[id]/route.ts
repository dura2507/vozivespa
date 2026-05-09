import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { findOverlap, describeConflict } from "@/lib/availability";
import { isValidSlot, parseTime } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/admin/bookings/[id]
// { dateFrom, dateTo, pickupTime, returnTime } — owner-side edit of
// the booked window. Re-runs the overlap check so the admin can't
// shift a booking into someone else's window.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    dateFrom?: unknown;
    dateTo?: unknown;
    pickupTime?: unknown;
    returnTime?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dateFrom = typeof body.dateFrom === "string" && ISO_DATE.test(body.dateFrom) ? body.dateFrom : null;
  const dateTo = typeof body.dateTo === "string" && ISO_DATE.test(body.dateTo) ? body.dateTo : null;
  const pickupTime = typeof body.pickupTime === "string" && isValidSlot(body.pickupTime) ? body.pickupTime : null;
  const returnTime = typeof body.returnTime === "string" && isValidSlot(body.returnTime) ? body.returnTime : null;

  if (!dateFrom || !dateTo || !pickupTime || !returnTime) {
    return NextResponse.json(
      { error: "All four fields are required and must be valid" },
      { status: 400 },
    );
  }
  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: "Pickup date must be on or before return date" },
      { status: 400 },
    );
  }
  if (dateFrom === dateTo && parseTime(pickupTime)! >= parseTime(returnTime)!) {
    return NextResponse.json(
      { error: "Same-day return must be later than pickup" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const { data: booking, error: lookupErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (lookupErr) {
    console.error("[/api/admin/bookings] lookup", lookupErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  try {
    const conflict = await findOverlap(supabase, {
      bikeId: booking.bike_id,
      dateFrom,
      dateTo,
      pickupTime,
      returnTime,
      excludeBookingId: booking.id,
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Time conflict", detail: describeConflict(conflict) },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[/api/admin/bookings] overlap", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      date_from: dateFrom,
      date_to: dateTo,
      pickup_time: pickupTime,
      return_time: returnTime,
    })
    .eq("id", id);
  if (updateErr) {
    console.error("[/api/admin/bookings] update", updateErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
