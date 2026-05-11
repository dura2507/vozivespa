import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

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
      .select("date_from, date_to")
      .eq("bike_id", bikeId)
      .is("booking_id", null)
      .order("date_from", { ascending: true }),
    supabase
      .from("bookings")
      .select("date_from, date_to, pickup_time, return_time, bike_unit_id")
      .eq("bike_id", bikeId)
      .eq("status", "confirmed")
      .order("date_from", { ascending: true }),
    supabase
      .from("bike_units")
      .select("id")
      .eq("bike_id", bikeId)
      .eq("active", true),
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

  return NextResponse.json({
    manualBlocks: (manualRes.data ?? []).map((row) => ({
      from: row.date_from,
      to: row.date_to,
    })),
    bookings: (bookingsRes.data ?? []).map((row) => ({
      from: row.date_from,
      to: row.date_to,
      pickupTime: trimT(row.pickup_time),
      returnTime: trimT(row.return_time),
      unitId: row.bike_unit_id,
    })),
    totalUnits: (unitsRes.data ?? []).length,
  });
}
