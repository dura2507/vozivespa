import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { findFreeUnit, findUnitConflict, describeConflict } from "@/lib/availability";
import { calculatePrice } from "@/lib/pricing";
import { getBikeWithPricing } from "@/lib/bike-pricing";
import { SESSION_COOKIE_NAME, isValidSession } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSession(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    process.env.ADMIN_PASSWORD ?? "",
  );
}

// POST /api/admin/bookings/[id]/group  { bikeId, ridingStyle? }
//
// Owner-side edit: add one more bike to this booking's group (for an
// on-site change). If the booking is still solo, it gets promoted to a
// group first. Assigns a free unit for the SAME window with the same
// overlap re-check as every other flow, so the owner can't double-book.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: { bikeId?: unknown; ridingStyle?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bikeId = typeof body.bikeId === "string" ? body.bikeId.trim() : "";
  const ridingStyle = body.ridingStyle === "with_passenger" ? "with_passenger" : "solo";
  if (!bikeId) {
    return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const window = {
    bikeId,
    dateFrom: booking.date_from,
    dateTo: booking.date_to,
    pickupTime: booking.pickup_time,
    returnTime: booking.return_time,
  };

  let free;
  try {
    free = await findFreeUnit(supabase, window);
  } catch (err) {
    console.error("[admin group add] availability", err);
    return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
  }
  if (!free.unitId) {
    return NextResponse.json(
      { error: free.conflict ? describeConflict(free.conflict) : "No free unit for this window" },
      { status: 409 },
    );
  }

  const bike = await getBikeWithPricing(bikeId);
  if (!bike) return NextResponse.json({ error: "Unknown bike" }, { status: 404 });
  const price = calculatePrice(
    new Date(`${booking.date_from}T00:00:00`),
    new Date(`${booking.date_to}T00:00:00`),
    booking.pickup_time,
    booking.return_time,
    bike.pricing,
  );
  if (!price) return NextResponse.json({ error: "Could not price this bike" }, { status: 400 });
  const priceCents = Math.round(price.totalPrice * 100);

  // Reuse the existing group, or promote a solo booking into a group by
  // stamping a fresh id onto the original row first.
  let groupId = booking.booking_group_id;
  if (!groupId) {
    groupId = crypto.randomUUID();
    const { error: upErr } = await supabase
      .from("bookings")
      .update({ booking_group_id: groupId })
      .eq("id", booking.id);
    if (upErr) {
      console.error("[admin group add] promote", upErr);
      return NextResponse.json({ error: "Could not create the group" }, { status: 500 });
    }
  }

  const { error: insErr } = await supabase.from("bookings").insert({
    bike_id: bikeId,
    customer_name: booking.customer_name,
    customer_email: booking.customer_email ?? "",
    customer_phone: booking.customer_phone ?? "",
    notes: booking.notes,
    date_from: booking.date_from,
    date_to: booking.date_to,
    pickup_time: booking.pickup_time,
    return_time: booking.return_time,
    total_price_cents: priceCents,
    payment_method: booking.payment_method,
    bike_unit_id: free.unitId,
    booking_group_id: groupId,
    drivers_licence: booking.drivers_licence,
    riding_style: ridingStyle,
    locale: booking.locale,
    status: booking.status,
    decided_at: booking.decided_at ?? new Date().toISOString(),
  });
  if (insErr) {
    console.error("[admin group add] insert", insErr);
    return NextResponse.json({ error: "Could not add the bike" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/bookings/[id]/group  { rowId }
//
// Remove one bike from the group (frees its unit). Refuses to remove the
// last remaining bike, use the cancel flow for that instead. If the row
// being removed is the one currently open, returns a sibling id to
// redirect to.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: { rowId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rowId = typeof body.rowId === "string" ? body.rowId : "";
  if (!rowId) return NextResponse.json({ error: "rowId is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data: row, error } = await supabase
    .from("bookings")
    .select("id, booking_group_id")
    .eq("id", rowId)
    .maybeSingle<{ id: string; booking_group_id: string | null }>();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Bike row not found" }, { status: 404 });
  if (!row.booking_group_id) {
    return NextResponse.json(
      { error: "This booking has only one bike. Cancel it instead." },
      { status: 400 },
    );
  }

  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("booking_group_id", row.booking_group_id);
  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: "Can't remove the last bike. Cancel the booking instead." },
      { status: 400 },
    );
  }

  const { error: delErr } = await supabase.from("bookings").delete().eq("id", rowId);
  if (delErr) {
    console.error("[admin group remove] delete", delErr);
    return NextResponse.json({ error: "Could not remove the bike" }, { status: 500 });
  }

  let redirectTo: string | null = null;
  if (rowId === id) {
    const { data: sib } = await supabase
      .from("bookings")
      .select("id")
      .eq("booking_group_id", row.booking_group_id)
      .limit(1)
      .maybeSingle<{ id: string }>();
    redirectTo = sib?.id ?? null;
  }
  return NextResponse.json({ ok: true, redirectTo });
}

// PATCH /api/admin/bookings/[id]/group  { rowId, toGhost }
//
// Ghost Bike swap (Priscilla's flow): move one bike of the booking onto
// the hidden reserve unit (is_backup) instead of cancelling — e.g. a rider
// too big for the assigned bike. Because backup units are excluded from
// the public capacity everywhere, parking a booking on the Ghost Bike
// automatically frees the regular unit for another rental. toGhost=false
// moves it back onto a free regular unit.
export async function PATCH(
  request: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { rowId?: unknown; toGhost?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rowId = typeof body.rowId === "string" ? body.rowId : "";
  const toGhost = body.toGhost !== false; // default: assign to ghost
  if (!rowId) return NextResponse.json({ error: "rowId is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", rowId)
    .maybeSingle<BookingRow>();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Bike row not found" }, { status: 404 });

  const window = {
    bikeId: booking.bike_id,
    dateFrom: booking.date_from,
    dateTo: booking.date_to,
    pickupTime: booking.pickup_time,
    returnTime: booking.return_time,
  };

  let targetUnitId: string;
  if (toGhost) {
    // The Ghost Bike is the model's hidden reserve unit (is_backup=true).
    const { data: ghost, error: gErr } = await supabase
      .from("bike_units")
      .select("id")
      .eq("bike_id", booking.bike_id)
      .eq("active", true)
      .eq("is_backup", true)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (gErr) return NextResponse.json({ error: "Database error" }, { status: 500 });
    if (!ghost) {
      return NextResponse.json(
        { error: "This model has no Ghost Bike (no reserve unit set up)." },
        { status: 400 },
      );
    }
    // Don't double-book the single Ghost Bike.
    const clash = await findUnitConflict(supabase, {
      bikeUnitId: ghost.id,
      dateFrom: booking.date_from,
      dateTo: booking.date_to,
      pickupTime: booking.pickup_time,
      returnTime: booking.return_time,
      excludeBookingId: booking.id,
    });
    if (clash) {
      return NextResponse.json(
        { error: `Ghost Bike is already taken for this window${clash.kind === "booking" ? ` (${clash.customerName})` : ""}.` },
        { status: 409 },
      );
    }
    targetUnitId = ghost.id;
  } else {
    // Move back onto a free regular (non-backup) unit.
    let free;
    try {
      free = await findFreeUnit(supabase, window);
    } catch {
      return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
    }
    if (!free.unitId) {
      return NextResponse.json(
        { error: free.conflict ? describeConflict(free.conflict) : "No free regular unit for this window" },
        { status: 409 },
      );
    }
    targetUnitId = free.unitId;
  }

  const { error: upErr } = await supabase
    .from("bookings")
    .update({ bike_unit_id: targetUnitId })
    .eq("id", booking.id);
  if (upErr) {
    console.error("[admin ghost swap] update", upErr);
    return NextResponse.json({ error: "Could not reassign the bike" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, onGhost: toGhost });
}
