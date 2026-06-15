import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";

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
    .select("id, status, picked_up_at")
    .eq("id", id)
    .maybeSingle<Pick<BookingRow, "id" | "status" | "picked_up_at">>();
  if (lookupErr) {
    console.error("[/api/admin/bookings/fulfillment] lookup", lookupErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const patch: Partial<Pick<BookingRow, "picked_up_at" | "returned_at">> = {};
  switch (action as Action) {
    case "pickup":
      patch.picked_up_at = now;
      break;
    case "undo_pickup":
      // Can't be returned if it was never picked up.
      patch.picked_up_at = null;
      patch.returned_at = null;
      break;
    case "return":
      // Returning implies it was collected first — keep the real pickup
      // time if we already have one, otherwise stamp it now.
      patch.returned_at = now;
      if (!booking.picked_up_at) patch.picked_up_at = now;
      break;
    case "undo_return":
      patch.returned_at = null;
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
