import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Read-only helper around abandoned online-payment bookings, plus a restore.
// The auto-cancel ("execute") was REMOVED after it wrongly cancelled a real
// Riderly booking: an abandoned online booking is INDISTINGUISHABLE in the data
// from a test one (a real customer who couldn't finish payment looks identical).
// So this route can only LIST candidates (a hint for a human) and RESTORE a
// booking to pending. Any actual cancelling is done by a human in /admin on a
// specific, confirmed booking. Never auto-cancel.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "krileo-cleanup-9f3a";
const AGE_MINUTES = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("t") !== TOKEN) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const supabase = getServiceClient();

  // Undo: restore a wrongly-cancelled booking back to pending.
  const restoreId = url.searchParams.get("restore");
  if (restoreId) {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "pending" })
      .eq("id", restoreId)
      .select("id, customer_name, status");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ restored: restoreId, status: "pending" });
  }

  // List only — NEVER cancels. This set is a hint for a human to review, not an
  // auto-cancel target: a real failed-payment customer is in here too.
  const ageParam = Number(url.searchParams.get("age"));
  const ageMinutes = Number.isFinite(ageParam) && ageParam >= 0 ? ageParam : AGE_MINUTES;
  const cutoff = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, customer_name, bike_id, date_from, date_to, created_at, booking_group_id")
    .eq("status", "pending")
    .is("deposit_screenshot_path", null)
    .is("payment_method", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    listOnly: true,
    note: "candidates only, never auto-cancelled; a human confirms and cancels specific ones in /admin",
    ageMinutes,
    count: (data ?? []).length,
    candidates: data ?? [],
  });
}
