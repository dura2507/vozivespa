import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isValidSlot, parseTime } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/blocks
// { bikeId, dateFrom, dateTo, bikeUnitId?, reason? }
//
// Manual full-day owner block. With `bikeUnitId` the block targets a
// single physical unit (other units of the same model stay bookable);
// without it the block covers the whole model. `reason` is a free-text
// note shown in the dashboard ("Reparatur", "Service", "Privat").
// booking_id stays null so the public availability endpoint treats it
// as a hard full-day block.
export async function POST(request: Request) {
  let body: {
    bikeId?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    bikeUnitId?: unknown;
    reason?: unknown;
    startTime?: unknown;
    endTime?: unknown;
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
  const bikeUnitId =
    typeof body.bikeUnitId === "string" && body.bikeUnitId.trim().length > 0
      ? body.bikeUnitId.trim()
      : null;
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 200)
      : null;
  // Time window: either both set (time-bounded block) or both null
  // (whole-day block). A half-spec is rejected to avoid ambiguous data.
  const startTime =
    typeof body.startTime === "string" && isValidSlot(body.startTime) ? body.startTime : null;
  const endTime =
    typeof body.endTime === "string" && isValidSlot(body.endTime) ? body.endTime : null;
  if ((startTime && !endTime) || (!startTime && endTime)) {
    return NextResponse.json(
      { error: "Provide both start and end time, or neither" },
      { status: 400 },
    );
  }
  if (startTime && endTime && parseTime(startTime)! >= parseTime(endTime)!) {
    return NextResponse.json(
      { error: "End time must be later than start time" },
      { status: 400 },
    );
  }

  if (!bikeId) return NextResponse.json({ error: "bikeId is required" }, { status: 400 });
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "Valid dates are required" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr) {
    console.error("[/api/admin/blocks] bike lookup", bikeErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!bike) return NextResponse.json({ error: "Bike not found" }, { status: 404 });

  // Sanity-check the unit belongs to the bike — otherwise a typo
  // would block the wrong model silently.
  if (bikeUnitId) {
    const { data: unit, error: unitErr } = await supabase
      .from("bike_units")
      .select("id, bike_id")
      .eq("id", bikeUnitId)
      .maybeSingle();
    if (unitErr) {
      console.error("[/api/admin/blocks] unit lookup", unitErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!unit || (unit as { bike_id: string }).bike_id !== bikeId) {
      return NextResponse.json({ error: "Unit doesn't belong to this bike" }, { status: 400 });
    }
  }

  const { error: insertErr } = await supabase.from("blocked_dates").insert({
    bike_id: bikeId,
    bike_unit_id: bikeUnitId,
    date_from: dateFrom,
    date_to: dateTo,
    start_time: startTime,
    end_time: endTime,
    reason,
  });
  if (insertErr) {
    console.error("[/api/admin/blocks] insert", insertErr);
    return NextResponse.json({ error: "Could not save block" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
