import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Cleans up ABANDONED online-payment bookings: the online flow reserves a
// pending booking BEFORE the card is charged, so a failed/abandoned payment
// leaves a pending row with neither a screenshot nor a payment_method. Manual
// bookings always carry a screenshot; admin walk-ins are inserted "confirmed".
// So (status=pending AND deposit_screenshot_path IS NULL AND payment_method
// IS NULL AND older than AGE_MINUTES) targets only dead online attempts.
//
// Soft-cancels (status='cancelled', reversible), never hard-deletes. Token
// gated. Dry-run by default: only ?execute=1 actually cancels. Also callable
// by a cron so abandoned attempts are always swept once online payment is live.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "krileo-cleanup-9f3a";
const AGE_MINUTES = 60; // a real customer completes or abandons payment well within this

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
  const execute = url.searchParams.get("execute") === "1";
  // Age override for the one-time manual sweep (?age=0 = any age). The cron
  // uses the safe default so a customer mid-payment is never cancelled.
  const ageParam = Number(url.searchParams.get("age"));
  const ageMinutes = Number.isFinite(ageParam) && ageParam >= 0 ? ageParam : AGE_MINUTES;
  const cutoff = new Date(Date.now() - ageMinutes * 60_000).toISOString();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, secret_token, bike_id, customer_name, customer_email, date_from, date_to, pickup_time, return_time, created_at, booking_group_id, status, payment_method, deposit_screenshot_path",
    )
    .eq("status", "pending")
    .is("deposit_screenshot_path", null)
    .is("payment_method", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const candidates = data ?? [];

  if (!execute) {
    return NextResponse.json({
      dryRun: true,
      ageMinutes,
      count: candidates.length,
      candidates: candidates.map((b) => ({
        id: b.id,
        customer: b.customer_name,
        bike: b.bike_id,
        from: b.date_from,
        to: b.date_to,
        created_at: b.created_at,
        group: b.booking_group_id,
      })),
    });
  }

  const ids = candidates.map((b) => b.id);
  if (ids.length === 0) return NextResponse.json({ cancelled: 0, ids: [] });
  const { error: updErr } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .in("id", ids);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ cancelled: ids.length, ids });
}
