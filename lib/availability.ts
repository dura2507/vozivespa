import type { SupabaseClient } from "@supabase/supabase-js";
import { TURNAROUND_MINUTES } from "@/lib/pricing";

// A booking's time window — used to find a free physical unit on the
// requested bike model.
export type BookingWindow = {
  bikeId: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  pickupTime: string; // HH:MM or HH:MM:SS
  returnTime: string;
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
    }
  | { kind: "no_units" };

export type AvailabilityResult = {
  // Set when at least one physical unit is free for the window.
  unitId: string | null;
  // Set when no unit can take the window. Carries enough detail for
  // a useful error message.
  conflict: Conflict | null;
};

function toMs(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`).getTime();
}

// Walks the bike's physical fleet and returns the first unit that has
// no time-overlapping confirmed booking (with the 1h turnaround buffer)
// and isn't covered by an owner manual block. Returns the conflict
// otherwise so callers can surface a useful message.
export async function findFreeUnit(
  supabase: SupabaseClient,
  w: BookingWindow,
): Promise<AvailabilityResult> {
  // 1. Manual owner blocks shut down the whole model.
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
    return {
      unitId: null,
      conflict: { kind: "manual", from: manuals[0].date_from, to: manuals[0].date_to },
    };
  }

  // 2. Active units for this bike model.
  const { data: units, error: unitErr } = await supabase
    .from("bike_units")
    .select("id, label")
    .eq("bike_id", w.bikeId)
    .eq("active", true)
    .order("label", { ascending: true });
  if (unitErr) throw new Error(`unit lookup: ${unitErr.message}`);
  if (!units || units.length === 0) {
    // No physical fleet defined yet — refuse rather than guessing.
    return { unitId: null, conflict: { kind: "no_units" } };
  }

  // 3. Other confirmed bookings on this model that overlap by date.
  let q = supabase
    .from("bookings")
    .select("id, bike_unit_id, date_from, date_to, pickup_time, return_time, customer_name")
    .eq("bike_id", w.bikeId)
    .eq("status", "confirmed")
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (w.excludeBookingId) q = q.neq("id", w.excludeBookingId);
  const { data: candidates, error: bookErr } = await q;
  if (bookErr) throw new Error(`booking overlap lookup: ${bookErr.message}`);

  // 4. Filter to time-overlapping (with 1h buffer); collect the unit
  //    ids those bookings hold.
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const newStart = toMs(w.dateFrom, w.pickupTime);
  const newEnd = toMs(w.dateTo, w.returnTime);
  const occupied = new Set<string>();
  let lastConflict: {
    id: string;
    bike_unit_id: string | null;
    date_from: string;
    date_to: string;
    pickup_time: string;
    return_time: string;
    customer_name: string;
  } | null = null;

  for (const c of candidates ?? []) {
    const cStart = toMs(c.date_from, c.pickup_time);
    const cEnd = toMs(c.date_to, c.return_time);
    if (newStart < cEnd + bufferMs && cStart - bufferMs < newEnd) {
      if (c.bike_unit_id) occupied.add(c.bike_unit_id);
      lastConflict = c;
    }
  }

  // 5. First active unit that nobody else holds.
  const free = units.find((u) => !occupied.has(u.id));
  if (free) return { unitId: free.id, conflict: null };

  // 6. Every unit is busy → return a representative conflict.
  if (lastConflict) {
    return {
      unitId: null,
      conflict: {
        kind: "booking",
        id: lastConflict.id,
        customerName: lastConflict.customer_name,
        dateFrom: lastConflict.date_from,
        dateTo: lastConflict.date_to,
        pickupTime: lastConflict.pickup_time.slice(0, 5),
        returnTime: lastConflict.return_time.slice(0, 5),
      },
    };
  }
  // No conflict info but still no free unit — shouldn't happen unless
  // every unit was deactivated mid-flight. Treat as no_units.
  return { unitId: null, conflict: { kind: "no_units" } };
}

// Human-readable reason for showing in toasts / error pages.
export function describeConflict(c: Conflict): string {
  if (c.kind === "manual") return `manual owner block ${c.from} → ${c.to}`;
  if (c.kind === "no_units") return "no physical units configured for this bike";
  return `${c.customerName} (${c.dateFrom} ${c.pickupTime} → ${c.dateTo} ${c.returnTime})`;
}

// Look up the human-friendly label for a unit ID (e.g. "Liberty50-2").
// Returns null if the unit can't be resolved — caller decides how to
// surface that.
export async function getBikeUnitLabel(
  supabase: SupabaseClient,
  unitId: string | null,
): Promise<string | null> {
  if (!unitId) return null;
  const { data, error } = await supabase
    .from("bike_units")
    .select("label")
    .eq("id", unitId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { label: string }).label;
}
