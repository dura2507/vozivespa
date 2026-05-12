import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { findFreeUnit, describeConflict } from "@/lib/availability";
import { isValidSlot, parseTime } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/bookings/manual
// { bikeId, dateFrom, dateTo, pickupTime, returnTime,
//   customerName, customerPhone?, customerEmail?, notes? }
//
// Owner-side flow for entering walk-in bookings (anything not booked
// via the website): writes a confirmed booking row directly so it
// appears in the dashboard's "upcoming" / "out" buckets just like a
// website booking that was then accepted. Runs the same availability
// check as the public flow so the owner can't double-book a unit.
//
// Customer email is the only optional contact field and is stored
// as null when blank — no acknowledgement mail is sent for walk-ins.
export async function POST(request: Request) {
  let body: {
    bikeId?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    pickupTime?: unknown;
    returnTime?: unknown;
    bikeUnitId?: unknown;
    customerName?: unknown;
    customerPhone?: unknown;
    customerEmail?: unknown;
    notes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bikeId = typeof body.bikeId === "string" ? body.bikeId.trim() : "";
  const dateFrom =
    typeof body.dateFrom === "string" && ISO_DATE.test(body.dateFrom) ? body.dateFrom : null;
  const dateTo =
    typeof body.dateTo === "string" && ISO_DATE.test(body.dateTo) ? body.dateTo : null;
  const pickupTime =
    typeof body.pickupTime === "string" && isValidSlot(body.pickupTime) ? body.pickupTime : null;
  const returnTime =
    typeof body.returnTime === "string" && isValidSlot(body.returnTime) ? body.returnTime : null;
  const requestedUnitId =
    typeof body.bikeUnitId === "string" && body.bikeUnitId.trim().length > 0
      ? body.bikeUnitId.trim()
      : null;
  const customerName =
    typeof body.customerName === "string" && body.customerName.trim().length > 0
      ? body.customerName.trim()
      : null;
  const customerPhone =
    typeof body.customerPhone === "string" && body.customerPhone.trim().length > 0
      ? body.customerPhone.trim()
      : null;
  const customerEmail =
    typeof body.customerEmail === "string" && body.customerEmail.trim().length > 0
      ? body.customerEmail.trim()
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null;

  if (!bikeId) return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }
  if (!pickupTime || !returnTime) {
    return NextResponse.json(
      { error: "Pickup and return times must be 09:00-19:00 in 30-minute slots" },
      { status: 400 },
    );
  }
  if (dateFrom === dateTo && parseTime(pickupTime)! >= parseTime(returnTime)!) {
    return NextResponse.json(
      { error: "Return time must be later than pickup time on a same-day booking" },
      { status: 400 },
    );
  }
  if (!customerName) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // 1. Bike exists + active
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, active")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr) {
    console.error("[/api/admin/bookings/manual] bike lookup", bikeErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!bike || !bike.active) {
    return NextResponse.json({ error: "Bike not available" }, { status: 404 });
  }

  // 2. Same overlap check as the public flow — the owner can't sneak
  //    in a walk-in that would conflict with a real booking.
  let availability;
  try {
    availability = await findFreeUnit(supabase, {
      bikeId,
      dateFrom,
      dateTo,
      pickupTime,
      returnTime,
    });
  } catch (err) {
    console.error("[/api/admin/bookings/manual] availability lookup", err);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  if (availability.conflict || !availability.unitId) {
    const c = availability.conflict;
    const message =
      c?.kind === "manual"
        ? "Selected dates are already blocked"
        : c?.kind === "no_units"
          ? "This bike has no active units"
          : "Time conflict with another booking on this model";
    return NextResponse.json(
      { error: message, detail: c ? describeConflict(c) : undefined },
      { status: 409 },
    );
  }

  // 2b. Owner picked a specific unit — honour it as long as that
  //     unit is actually free. Otherwise fall back to the auto-
  //     assigned one and surface the swap in the response.
  let assignedUnitId = availability.unitId;
  if (requestedUnitId) {
    const { data: unit, error: unitErr } = await supabase
      .from("bike_units")
      .select("id, bike_id, active")
      .eq("id", requestedUnitId)
      .maybeSingle();
    if (unitErr) {
      console.error("[/api/admin/bookings/manual] unit lookup", unitErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!unit || (unit as { bike_id: string }).bike_id !== bikeId) {
      return NextResponse.json({ error: "Unit doesn't belong to this bike" }, { status: 400 });
    }
    // Re-check by running availability with the rest of the fleet
    // hidden — cheapest is just to inspect the existing result: if
    // the auto-pick differs from the request, the requested unit
    // must be occupied (booking or service block).
    if (requestedUnitId !== availability.unitId) {
      const { data: occBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("status", "confirmed")
        .eq("bike_unit_id", requestedUnitId)
        .lte("date_from", dateTo)
        .gte("date_to", dateFrom)
        .limit(1);
      const { data: occBlocks } = await supabase
        .from("blocked_dates")
        .select("id")
        .eq("bike_unit_id", requestedUnitId)
        .is("booking_id", null)
        .lte("date_from", dateTo)
        .gte("date_to", dateFrom)
        .limit(1);
      if ((occBookings && occBookings.length > 0) || (occBlocks && occBlocks.length > 0)) {
        return NextResponse.json(
          { error: "Selected unit is not free for this window" },
          { status: 409 },
        );
      }
    }
    assignedUnitId = requestedUnitId;
  }

  // 3. Insert directly as confirmed. No receipt, no payment method —
  //    walk-ins are handled outside the website.
  const nowIso = new Date().toISOString();
  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      bike_id: bikeId,
      customer_name: customerName,
      customer_email: customerEmail ?? "",
      customer_phone: customerPhone ?? "",
      notes,
      date_from: dateFrom,
      date_to: dateTo,
      pickup_time: pickupTime,
      return_time: returnTime,
      total_price_cents: null,
      payment_method: null,
      bike_unit_id: assignedUnitId,
      drivers_licence: null,
      riding_style: null,
      locale: "en",
      status: "confirmed",
      decided_at: nowIso,
    })
    .select("id, status")
    .single();
  if (insertErr || !booking) {
    console.error("[/api/admin/bookings/manual] insert", insertErr);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: booking.id, status: booking.status });
}
