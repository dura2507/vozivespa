import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/admin/blocks — { bikeId, dateFrom, dateTo }
// Manual full-day owner block. booking_id stays null so the public
// availability endpoint treats it as a hard full-day block.
export async function POST(request: Request) {
  let body: { bikeId?: unknown; dateFrom?: unknown; dateTo?: unknown };
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

  const { error: insertErr } = await supabase
    .from("blocked_dates")
    .insert({ bike_id: bikeId, date_from: dateFrom, date_to: dateTo });
  if (insertErr) {
    console.error("[/api/admin/blocks] insert", insertErr);
    return NextResponse.json({ error: "Could not save block" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
