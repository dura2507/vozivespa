import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { blockedPickupDates } from "@/lib/availability";
import { zagrebNow } from "@/lib/season";

export const dynamic = "force-dynamic";

// GET /api/availability?bikeId=bike-390
//
// Returns enough info for the booking form to compute "is this date /
// time slot still bookable on this model?" without hitting the API
// per click. Multi-unit aware: a date is only fully blocked when every
// active unit of the model has an overlapping confirmed booking.
//
// Shape:
//   manualBlocks: full-day owner blocks (any matches → date is blocked)
//   bookings:     each confirmed booking with its unit id and times
//   totalUnits:   how many active units this model has . frontend uses
//                 this as the "all booked" threshold
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bikeId = searchParams.get("bikeId");
  if (!bikeId) {
    return NextResponse.json(
      { error: "bikeId query parameter is required" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  const [manualRes, bookingsRes, unitsRes] = await Promise.all([
    supabase
      .from("blocked_dates")
      .select("date_from, date_to, start_time, end_time, bike_unit_id")
      .eq("bike_id", bikeId)
      .is("booking_id", null)
      .order("date_from", { ascending: true }),
    supabase
      .from("bookings")
      .select("date_from, date_to, pickup_time, return_time, bike_unit_id")
      .eq("bike_id", bikeId)
      // Pending bookings hold a slot until Thomas confirms or declines —
      // ignoring them led to "09:00 is free" while a pending booking
      // sat on the same window. Both states block public availability.
      .in("status", ["confirmed", "pending"])
      // A booking marked returned (bike physically back) frees the unit
      // immediately, even if its scheduled return time is still ahead.
      .is("returned_at", null)
      .order("date_from", { ascending: true }),
    supabase
      .from("bike_units")
      .select("id")
      .eq("bike_id", bikeId)
      .eq("active", true)
      // Reserve / backup units are off-the-books online (Thomas's
      // walk-in joker). They don't count toward fleet size, calendar
      // capacity, or slot availability anywhere on the public site.
      .eq("is_backup", false),
  ]);

  if (manualRes.error) {
    console.error("[/api/availability] manual blocks", manualRes.error);
    return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
  }
  if (bookingsRes.error) {
    console.error("[/api/availability] bookings", bookingsRes.error);
    return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
  }
  if (unitsRes.error) {
    console.error("[/api/availability] units", unitsRes.error);
    return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
  }

  const trimT = (t: string) => t.slice(0, 5);

  // A block is "effectively all-day" when it has no time bounds
  // (start_time + end_time both null = legacy whole-day block) OR
  // when it runs all the way to shop close (19:00). Owner asked: if
  // a unit is blocked until close, treat it as the whole day — the
  // remaining hours aren't useful for a rental anyway.
  const isEffectivelyAllDay = (
    start: string | null,
    end: string | null,
  ): boolean => {
    if (!start || !end) return true;
    return end >= "19:00:00";
  };

  const manualBlocks = (manualRes.data ?? []).map((row) => ({
    from: row.date_from,
    to: row.date_to,
    startTime: row.start_time ? trimT(row.start_time) : null,
    endTime: row.end_time ? trimT(row.end_time) : null,
    unitId: row.bike_unit_id, // null = whole-model block
    effectiveAllDay: isEffectivelyAllDay(row.start_time, row.end_time),
  }));
  const allBookings = (bookingsRes.data ?? []).map((row) => ({
    from: row.date_from,
    to: row.date_to,
    pickupTime: trimT(row.pickup_time),
    returnTime: trimT(row.return_time),
    unitId: row.bike_unit_id,
  }));
  const unitIds = (unitsRes.data ?? []).map((u) => (u as { id: string }).id);
  // Reserve / backup units are off-the-books online (the ghost-bike flow
  // parks a booking on a hidden reserve unit). Their bookings must never
  // shrink PUBLIC availability. blockedPickupDates already scopes to
  // unitIds, but we also drop reserve-unit rows from the payload so the
  // returned `bookings` stays self-consistent with `unitIds` — otherwise a
  // client slot filter can count a reserve booking against regular capacity
  // (the same-day empty-pickup bug). Keep legacy null-unit rows (they
  // conservatively block the whole model).
  const publicUnitIds = new Set(unitIds);
  const bookings = allBookings.filter(
    (b) => !b.unitId || publicUnitIds.has(b.unitId),
  );
  // Same rule for manual blocks: a service block pinned to the ghost/backup
  // reserve must never shrink PUBLIC capacity. blockedPickupDates guards
  // internally too, but the payload has to stay self-consistent for the
  // client-side slot filters. Whole-model blocks (unitId null) stay.
  const publicBlocks = manualBlocks.filter(
    (m) => !m.unitId || publicUnitIds.has(m.unitId),
  );

  return NextResponse.json({
    manualBlocks: publicBlocks,
    bookings,
    totalUnits: unitIds.length,
    unitIds,
    // THE calendar truth: every future date with zero possible pickup
    // slots, computed server-side with the exact findFreeUnit rules
    // (bookings + manual blocks + turnaround buffer + Zagreb clock).
    // The frontend paints this list verbatim instead of re-deriving it,
    // so the single-bike calendar can never contradict the fleet view
    // or the submit check.
    blockedPickupDates: blockedPickupDates(bookings, publicBlocks, unitIds, zagrebNow()),
  });
}
