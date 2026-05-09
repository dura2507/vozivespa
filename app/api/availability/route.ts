import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/availability?bikeId=bike-390
//
// Splits unavailable windows into:
//   - manualBlocks: owner-set full-day blocks (no pickup/return times).
//     Treated as fully unbookable on the calendar.
//   - bookings: confirmed customer bookings, with pickup/return times so
//     the booking form can filter the time-slot pickers (e.g. only show
//     pickup slots ≥ existing return + buffer on a shared edge day).
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

  const [manualRes, bookingsRes] = await Promise.all([
    supabase
      .from("blocked_dates")
      .select("date_from, date_to")
      .eq("bike_id", bikeId)
      .is("booking_id", null)
      .order("date_from", { ascending: true }),
    supabase
      .from("bookings")
      .select("date_from, date_to, pickup_time, return_time")
      .eq("bike_id", bikeId)
      .eq("status", "confirmed")
      .order("date_from", { ascending: true }),
  ]);

  if (manualRes.error) {
    console.error("[/api/availability] manual blocks error", manualRes.error);
    return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
  }
  if (bookingsRes.error) {
    console.error("[/api/availability] bookings error", bookingsRes.error);
    return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
  }

  // Postgres `time` returns 'HH:MM:SS' — trim to HH:MM for the frontend.
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
    })),
  });
}
