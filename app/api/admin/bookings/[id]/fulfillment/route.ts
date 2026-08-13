import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { findUnitConflict, findUnitForOwnerAction, describeConflict } from "@/lib/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/bookings/[id]/fulfillment · { action }
//
// Owner-side manual pickup / return confirmation. Sets (or clears) the
// picked_up_at / returned_at timestamps that drive the dashboard
// pickup/return buckets. Marking returned also implies picked up;
// undoing pickup also clears the return so the states stay consistent.
const ACTIONS = ["pickup", "undo_pickup", "return", "undo_return"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: booking, error: lookupErr } = await supabase
    .from("bookings")
    .select("id, status, picked_up_at, returned_at, bike_id, bike_unit_id, date_from, date_to, pickup_time, return_time")
    .eq("id", id)
    .maybeSingle<
      Pick<
        BookingRow,
        | "id"
        | "status"
        | "picked_up_at"
        | "returned_at"
        | "bike_id"
        | "bike_unit_id"
        | "date_from"
        | "date_to"
        | "pickup_time"
        | "return_time"
      >
    >();
  if (lookupErr) {
    console.error("[/api/admin/bookings/fulfillment] lookup", lookupErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Undoing a return re-introduces this booking's demand (every capacity
  // query filters `returned_at IS NULL`). If the freed slot was rebooked in
  // the meantime, silently reviving it would over-book the fleet — so
  // re-run the same capacity gate every booking write uses. Only the
  // remaining window matters: for an already-started rental check from
  // today, not from the original pickup date.
  let revivedUnitId: string | null | undefined;
  const revivesDemand =
    (action === "undo_return" || action === "undo_pickup") &&
    booking.returned_at != null &&
    booking.status === "confirmed";
  if (revivesDemand) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const fromIso = booking.date_from > todayIso ? booking.date_from : todayIso;
    if (booking.date_to >= fromIso) {
      try {
        // Regular fleet only. If this booking sits on the Ghost Bike, the
        // helper validates against that one vehicle instead, so undoing a
        // return works even when every regular bike is out.
        const availability = await findUnitForOwnerAction(
          supabase,
          {
            bikeId: booking.bike_id,
            dateFrom: fromIso,
            dateTo: booking.date_to,
            pickupTime: booking.pickup_time,
            returnTime: booking.return_time,
            excludeBookingId: booking.id,
          },
          booking.bike_unit_id,
        );
        // Capacity passing does not mean the row's OLD unit is still free -
        // the freed slot may have been given to someone else meanwhile. Adopt
        // the unit the gate just proved free (or the reserve it kept), so two
        // live bookings can never end up pinned to the same vehicle.
        // Prefer the booking's OWN pin when it is still free - findFreeUnit
        // returns the lowest-label free unit, which would needlessly move a
        // live rental onto a different vehicle.
        revivedUnitId = availability.unitId;
        if (booking.bike_unit_id && booking.bike_unit_id !== availability.unitId) {
          const ownStillFree = await findUnitConflict(supabase, {
            bikeUnitId: booking.bike_unit_id,
            dateFrom: fromIso,
            dateTo: booking.date_to,
            pickupTime: booking.pickup_time,
            returnTime: booking.return_time,
            excludeBookingId: booking.id,
          });
          if (!ownStillFree) revivedUnitId = booking.bike_unit_id;
        }
        if (availability.conflict) {
          return NextResponse.json(
            {
              error: `Can't undo the return — the freed slot was taken in the meantime (${describeConflict(availability.conflict)}).`,
            },
            { status: 409 },
          );
        }
      } catch (err) {
        console.error("[/api/admin/bookings/fulfillment] availability", err);
        return NextResponse.json({ error: "Could not check availability" }, { status: 500 });
      }
    }
  }

  const now = new Date().toISOString();
  const patch: Partial<Pick<BookingRow, "picked_up_at" | "returned_at" | "bike_unit_id">> = {};
  switch (action as Action) {
    case "pickup":
      patch.picked_up_at = now;
      break;
    case "undo_pickup":
      // Can't be returned if it was never picked up.
      patch.picked_up_at = null;
      patch.returned_at = null;
      // This also revives demand, so adopt the unit the gate proved free.
      if (revivedUnitId !== undefined) patch.bike_unit_id = revivedUnitId;
      break;
    case "return":
      // Returning implies it was collected first — keep the real pickup
      // time if we already have one, otherwise stamp it now.
      patch.returned_at = now;
      if (!booking.picked_up_at) patch.picked_up_at = now;
      break;
    case "undo_return":
      patch.returned_at = null;
      // Re-pin to the vehicle the capacity gate just proved free. The old pin
      // may have been handed to someone else while this booking counted as
      // returned, and two rows on one bike is exactly what the unit labels
      // must never claim.
      if (revivedUnitId !== undefined) patch.bike_unit_id = revivedUnitId;
      break;
  }

  const { error: updErr } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", id);
  if (updErr) {
    console.error("[/api/admin/bookings/fulfillment] update", updErr);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
