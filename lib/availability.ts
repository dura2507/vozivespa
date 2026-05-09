import type { SupabaseClient } from "@supabase/supabase-js";
import { TURNAROUND_MINUTES } from "@/lib/pricing";

// A booking's time window — used to check whether it can coexist with
// every other confirmed booking and manual block on the same bike.
export type BookingWindow = {
  bikeId: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  pickupTime: string; // HH:MM or HH:MM:SS
  returnTime: string; // HH:MM or HH:MM:SS
  // Confirm-time check: ignore the booking itself (avoid self-conflict).
  excludeBookingId?: string;
};

export type Conflict =
  | { kind: "manual"; from: string; to: string }
  | {
      kind: "booking";
      id: string;
      customerName: string;
      dateFrom: string;
      dateTo: string;
      pickupTime: string;
      returnTime: string;
    };

function toMs(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`).getTime();
}

// Single source of truth for "does this window collide with anything
// already on the bike's calendar". Used at INSERT time (pending booking
// creation) and again at status-flip time (Telegram / email confirm),
// so a second pending booking can't sneak through while the first is
// still pending.
//
// Throws on database errors so callers can choose how to surface them.
export async function findOverlap(
  supabase: SupabaseClient,
  w: BookingWindow,
): Promise<Conflict | null> {
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const newStart = toMs(w.dateFrom, w.pickupTime);
  const newEnd = toMs(w.dateTo, w.returnTime);

  // 1. Owner manual blocks - full-day, inclusive overlap.
  const { data: manuals, error: manualErr } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to")
    .eq("bike_id", w.bikeId)
    .is("booking_id", null)
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom)
    .limit(1);
  if (manualErr) throw new Error(`manual block lookup: ${manualErr.message}`);
  if (manuals && manuals.length > 0) {
    return { kind: "manual", from: manuals[0].date_from, to: manuals[0].date_to };
  }

  // 2. Other confirmed bookings - time-aware overlap with 1h buffer.
  let q = supabase
    .from("bookings")
    .select("id, date_from, date_to, pickup_time, return_time, customer_name")
    .eq("bike_id", w.bikeId)
    .eq("status", "confirmed")
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (w.excludeBookingId) q = q.neq("id", w.excludeBookingId);
  const { data: candidates, error: bookErr } = await q;
  if (bookErr) throw new Error(`booking overlap lookup: ${bookErr.message}`);

  for (const c of candidates ?? []) {
    const cStart = toMs(c.date_from, c.pickup_time);
    const cEnd = toMs(c.date_to, c.return_time);
    if (newStart < cEnd + bufferMs && cStart - bufferMs < newEnd) {
      return {
        kind: "booking",
        id: c.id,
        customerName: c.customer_name,
        dateFrom: c.date_from,
        dateTo: c.date_to,
        pickupTime: c.pickup_time.slice(0, 5),
        returnTime: c.return_time.slice(0, 5),
      };
    }
  }

  return null;
}

// Human-readable reason for showing in toasts / error pages.
export function describeConflict(c: Conflict): string {
  if (c.kind === "manual") {
    return `manual owner block ${c.from} → ${c.to}`;
  }
  return `${c.customerName} (${c.dateFrom} ${c.pickupTime} → ${c.dateTo} ${c.returnTime})`;
}
