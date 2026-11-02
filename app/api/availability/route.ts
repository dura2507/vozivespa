import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { blockedPickupDates, publicCalendarInputs } from "@/lib/availability";
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

  const unitIds = (unitsRes.data ?? []).map((u) => (u as { id: string }).id);
  // Raw rows -> public calendar inputs (lib/availability.ts, shared with the
  // homepage season pill). Rows on a reserve/backup unit are dropped there so
  // they never shrink PUBLIC availability and this payload stays
  // self-consistent with `unitIds` for the client slot filters (the same-day
  // empty-pickup bug); legacy null-unit rows and whole-model blocks stay.
  const { bookings, blocks: publicBlocks } = publicCalendarInputs(
    manualRes.data ?? [],
    bookingsRes.data ?? [],
    unitIds,
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
