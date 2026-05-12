import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { findFreeUnit, findUnitConflict, describeConflict } from "@/lib/availability";
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
    bikeUnitIds?: unknown;
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
  // Array form: book N specific units in one transaction. Used by
  // the "quantity > 1" path in the admin form where the client
  // pre-selects N unit ids from the available pool.
  const requestedUnitIds: string[] | null =
    Array.isArray(body.bikeUnitIds) && body.bikeUnitIds.every((u) => typeof u === "string" && u.length > 0)
      ? (body.bikeUnitIds as string[])
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

  // 2b. Figure out which physical units this walk-in covers:
  //     - "all"             → every active unit of the model (group booking)
  //     - bikeUnitIds array → those N specific units (quantity-based path)
  //     - <unit-id>         → exactly that unit, must be free
  //     - undefined         → just the auto-picked free unit (single)
  const unitsToBook: string[] = [];
  if (requestedUnitIds && requestedUnitIds.length > 0) {
    // Validate every id belongs to this bike + is active + is free.
    const { data: ownedUnits, error: ownErr } = await supabase
      .from("bike_units")
      .select("id, bike_id, active")
      .in("id", requestedUnitIds);
    if (ownErr) {
      console.error("[/api/admin/bookings/manual] units lookup", ownErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const valid = (ownedUnits ?? []) as Array<{ id: string; bike_id: string; active: boolean }>;
    const bad = requestedUnitIds.find(
      (id) => !valid.some((v) => v.id === id && v.bike_id === bikeId && v.active),
    );
    if (bad) {
      return NextResponse.json(
        { error: "One of the chosen units doesn't belong to this bike" },
        { status: 400 },
      );
    }
    const conflicts: string[] = [];
    for (const uid of requestedUnitIds) {
      const c = await findUnitConflict(supabase, {
        bikeUnitId: uid,
        dateFrom,
        dateTo,
        pickupTime,
        returnTime,
      });
      if (c) conflicts.push(uid);
    }
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: `Can't book — ${conflicts.length} of ${requestedUnitIds.length} unit(s) not free for this window`,
        },
        { status: 409 },
      );
    }
    unitsToBook.push(...requestedUnitIds);
  } else if (requestedUnitId === "all") {
    const { data: allUnits, error: unitErr } = await supabase
      .from("bike_units")
      .select("id")
      .eq("bike_id", bikeId)
      .eq("active", true);
    if (unitErr) {
      console.error("[/api/admin/bookings/manual] all-units lookup", unitErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const unitIds = (allUnits ?? []).map((u) => (u as { id: string }).id);
    if (unitIds.length === 0) {
      return NextResponse.json({ error: "This bike has no active units" }, { status: 404 });
    }
    // Every unit needs to be free for the same window — otherwise we
    // can't fulfil the group booking. Time-aware so a 2h service
    // block in the morning doesn't kill an afternoon group booking.
    const conflicts: string[] = [];
    for (const uid of unitIds) {
      const c = await findUnitConflict(supabase, {
        bikeUnitId: uid,
        dateFrom,
        dateTo,
        pickupTime,
        returnTime,
      });
      if (c) conflicts.push(uid);
    }
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: `Can't book all units — ${conflicts.length} of ${unitIds.length} unavailable for this window`,
        },
        { status: 409 },
      );
    }
    unitsToBook.push(...unitIds);
  } else if (requestedUnitId) {
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
    if (requestedUnitId !== availability.unitId) {
      const c = await findUnitConflict(supabase, {
        bikeUnitId: requestedUnitId,
        dateFrom,
        dateTo,
        pickupTime,
        returnTime,
      });
      if (c) {
        const detail =
          c.kind === "booking"
            ? `booked by ${c.customerName}`
            : c.reason
              ? `service: ${c.reason}`
              : "service block";
        return NextResponse.json(
          { error: `Selected unit is not free — ${detail}` },
          { status: 409 },
        );
      }
    }
    unitsToBook.push(requestedUnitId);
  } else {
    unitsToBook.push(availability.unitId);
  }

  // 3. Insert one confirmed booking per unit. No receipt, no payment
  //    method — walk-ins are handled outside the website. Group
  //    bookings (2+ units) carry a shared booking_group_id so the
  //    dashboard can collapse them into a single customer entry.
  const nowIso = new Date().toISOString();
  const groupId = unitsToBook.length > 1 ? crypto.randomUUID() : null;
  const rows = unitsToBook.map((unitId) => ({
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
    bike_unit_id: unitId,
    booking_group_id: groupId,
    drivers_licence: null,
    riding_style: null,
    locale: "en" as const,
    status: "confirmed" as const,
    decided_at: nowIso,
  }));
  const { data: bookings, error: insertErr } = await supabase
    .from("bookings")
    .insert(rows)
    .select("id, status");
  if (insertErr || !bookings || bookings.length === 0) {
    console.error("[/api/admin/bookings/manual] insert", insertErr);
    return NextResponse.json({ error: "Could not save booking" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: bookings.length,
    ids: bookings.map((b) => (b as { id: string }).id),
  });
}
