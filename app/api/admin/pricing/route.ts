import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/mockData";
import { setPriceOverrides } from "@/lib/bike-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/pricing
// Body: { bikeId, dayPrice?, weekendPrice?, weekPrice?, monthPrice? }
// All tier prices are optional bare euro integers (no currency suffix).
// Pass `null` in any slot to clear the override and fall back to the
// mockData default for that tier. Owner-only — gated by middleware.
export async function POST(request: Request) {
  let body: {
    bikeId?: unknown;
    dayPrice?: unknown;
    weekendPrice?: unknown;
    weekPrice?: unknown;
    monthPrice?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bikeId = typeof body.bikeId === "string" ? body.bikeId.trim() : "";
  if (!bikeId || !CATEGORIES.some((c) => c.id === bikeId)) {
    return NextResponse.json({ error: "Unknown bike" }, { status: 400 });
  }

  function coerce(v: unknown): number | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > 99999) {
      throw new Error("price must be 1-99999");
    }
    return v;
  }

  let prices: Parameters<typeof setPriceOverrides>[1];
  try {
    prices = {
      day: coerce(body.dayPrice),
      weekend: coerce(body.weekendPrice),
      week: coerce(body.weekPrice),
      month: coerce(body.monthPrice),
    };
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid price" },
      { status: 400 },
    );
  }

  try {
    await setPriceOverrides(bikeId, prices);
  } catch (err) {
    console.error("[/api/admin/pricing] save", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
