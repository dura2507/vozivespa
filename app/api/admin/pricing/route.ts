import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/mockData";
import { setDayPriceOverride } from "@/lib/bike-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/pricing . { bikeId, dayPrice }
// Owner-only (gated by middleware). Upserts the day-price override
// for one bike. dayPrice is the bare euro number, no currency suffix.
export async function POST(request: Request) {
  let body: { bikeId?: unknown; dayPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bikeId = typeof body.bikeId === "string" ? body.bikeId.trim() : "";
  const dayPrice = typeof body.dayPrice === "number" ? body.dayPrice : NaN;

  if (!bikeId || !CATEGORIES.some((c) => c.id === bikeId)) {
    return NextResponse.json({ error: "Unknown bike" }, { status: 400 });
  }
  if (!Number.isInteger(dayPrice) || dayPrice <= 0 || dayPrice > 9999) {
    return NextResponse.json({ error: "Day price must be 1-9999" }, { status: 400 });
  }

  try {
    await setDayPriceOverride(bikeId, dayPrice);
  } catch (err) {
    console.error("[/api/admin/pricing] save", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
