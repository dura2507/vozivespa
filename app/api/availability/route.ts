import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/availability?bikeId=bike-390
//
// Returns the date ranges that are not bookable for the given bike — both
// auto-blocks coming from confirmed bookings and any manual owner blocks.
//
// Response: { blocked: Array<{ from: string; to: string }> }
//          where from/to are ISO YYYY-MM-DD strings.
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
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to")
    .eq("bike_id", bikeId)
    .order("date_from", { ascending: true });

  if (error) {
    console.error("[/api/availability] supabase error", error);
    return NextResponse.json(
      { error: "Could not load availability" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    blocked: (data ?? []).map((row) => ({ from: row.date_from, to: row.date_to })),
  });
}
