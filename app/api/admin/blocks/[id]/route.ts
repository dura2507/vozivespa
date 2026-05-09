import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/admin/blocks/[id]
// Refuses to delete blocks that came from a booking (booking_id set)
// — those should be cleared by changing the booking's status.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data: row, error: lookupErr } = await supabase
    .from("blocked_dates")
    .select("id, booking_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[/api/admin/blocks DELETE] lookup", lookupErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.booking_id) {
    return NextResponse.json(
      { error: "This block belongs to a booking — change the booking status instead" },
      { status: 400 },
    );
  }
  const { error: delErr } = await supabase.from("blocked_dates").delete().eq("id", id);
  if (delErr) {
    console.error("[/api/admin/blocks DELETE] delete", delErr);
    return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
