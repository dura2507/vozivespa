import type { SupabaseClient } from "@supabase/supabase-js";
import { TURNAROUND_MINUTES, buildSlots } from "@/lib/pricing";

// A booking's time window . used to find a free physical unit on the
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
  // Admin-only escape hatch. The public flow keeps backup units hidden
  // (Thomas's reserve joker), but manual owner actions — model switch,
  // manual booking — may deliberately reach for the reserve when the
  // regular fleet is full.
  opts: { includeBackup?: boolean } = {},
): Promise<AvailabilityResult> {
  // 1. Manual owner blocks. A row with bike_unit_id = null still
  //    shuts down the whole model (legacy + saison-pause use cases).
  //    Per-unit rows only take that single unit out — we collect them
  //    so step 5 can skip occupied units. Time-bounded blocks (with
  //    start_time + end_time set) only conflict on actual time overlap
  //    so a 2h morning service doesn't grey out the whole day.
  const { data: manuals, error: manualErr } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to, start_time, end_time, bike_unit_id")
    .eq("bike_id", w.bikeId)
    .is("booking_id", null)
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (manualErr) throw new Error(`manual block lookup: ${manualErr.message}`);

  const newStartMs = toMs(w.dateFrom, w.pickupTime);
  const newEndMs = toMs(w.dateTo, w.returnTime);

  // Does the customer's requested window actually overlap a manual
  // block? Whole-day blocks (no times) overlap any window that lands
  // on those dates; time-bounded blocks need a real time overlap.
  function overlapsManual(m: {
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
  }): boolean {
    if (!m.start_time || !m.end_time) return true; // whole-day → always
    const mStart = toMs(m.date_from, m.start_time);
    const mEnd = toMs(m.date_to, m.end_time);
    return newStartMs < mEnd && mStart < newEndMs;
  }

  const blockedUnitIds = new Set<string>();
  for (const m of (manuals ?? []) as Array<{
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
    bike_unit_id: string | null;
  }>) {
    if (!overlapsManual(m)) continue;
    if (m.bike_unit_id === null) {
      return {
        unitId: null,
        conflict: { kind: "manual", from: m.date_from, to: m.date_to },
      };
    }
    blockedUnitIds.add(m.bike_unit_id);
  }

  // 2. Active units for this bike model. Backup / reserve units are
  // excluded from the pool by default — Thomas hands them out as a
  // walk-in joker, never via the public booking flow — unless an admin
  // action explicitly opts in via includeBackup.
  let unitQuery = supabase
    .from("bike_units")
    .select("id, label")
    .eq("bike_id", w.bikeId)
    .eq("active", true);
  if (!opts.includeBackup) unitQuery = unitQuery.eq("is_backup", false);
  const { data: units, error: unitErr } = await unitQuery.order("label", {
    ascending: true,
  });
  if (unitErr) throw new Error(`unit lookup: ${unitErr.message}`);
  if (!units || units.length === 0) {
    // No physical fleet defined yet . refuse rather than guessing.
    return { unitId: null, conflict: { kind: "no_units" } };
  }
  // Per-unit manual blocks are treated as if the unit was held by a
  // booking — combine the two sets later.
  const occupiedByManual = blockedUnitIds;

  // 3. Other confirmed bookings on this model that overlap by date.
  let q = supabase
    .from("bookings")
    .select("id, bike_unit_id, date_from, date_to, pickup_time, return_time, customer_name")
    .eq("bike_id", w.bikeId)
    .in("status", ["confirmed", "pending"])
    // Returned bikes are free again immediately, ignore them.
    .is("returned_at", null)
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

  // 5. First active unit that nobody else holds (and that isn't
  //    flagged for service / repair via a per-unit manual block).
  const free = units.find((u) => !occupied.has(u.id) && !occupiedByManual.has(u.id));
  if (free) return { unitId: free.id, conflict: null };

  // 5b. Every unit free of bookings is service-blocked → surface that
  //     instead of "Time conflict with another booking".
  const onlyServiceBusy = units.every((u) => occupiedByManual.has(u.id) || occupied.has(u.id));
  if (onlyServiceBusy && occupiedByManual.size > 0 && !lastConflict) {
    // We don't know which exact row to point at — pick the first
    // overlapping manual so the message still has a date range.
    const first = (manuals ?? []).find((m) => m.bike_unit_id);
    if (first) {
      return {
        unitId: null,
        conflict: { kind: "manual", from: first.date_from, to: first.date_to },
      };
    }
  }

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
  // No conflict info but still no free unit . shouldn't happen unless
  // every unit was deactivated mid-flight. Treat as no_units.
  return { unitId: null, conflict: { kind: "no_units" } };
}

// Time-aware "is unit X free for this window" check. Returns the
// first overlapping booking or block when busy, null when free.
// Use this instead of date-only filters when checking a specific
// unit, because manual blocks can carry a time window now (e.g.
// 2h service from 09:00-12:00 leaves the rest of the day open).
export async function findUnitConflict(
  supabase: SupabaseClient,
  args: {
    bikeUnitId: string;
    dateFrom: string;
    dateTo: string;
    pickupTime: string;
    returnTime: string;
    excludeBookingId?: string;
  },
): Promise<
  | { kind: "booking"; customerName: string; from: string; to: string }
  | { kind: "block"; from: string; to: string; reason: string | null }
  | null
> {
  const newStart = toMs(args.dateFrom, args.pickupTime);
  const newEnd = toMs(args.dateTo, args.returnTime);

  let bq = supabase
    .from("bookings")
    .select("id, customer_name, date_from, date_to, pickup_time, return_time")
    .in("status", ["confirmed", "pending"])
    // A returned bike frees its unit immediately — ignore returned rows,
    // same as findFreeUnit / findFreeUnits. Without this, confirming a
    // booking that reused an early-returned unit would falsely conflict.
    .is("returned_at", null)
    .eq("bike_unit_id", args.bikeUnitId)
    .lte("date_from", args.dateTo)
    .gte("date_to", args.dateFrom);
  if (args.excludeBookingId) bq = bq.neq("id", args.excludeBookingId);
  const { data: bookings, error: bErr } = await bq;
  if (bErr) throw new Error(`booking conflict lookup: ${bErr.message}`);
  for (const b of (bookings ?? []) as Array<{
    id: string;
    customer_name: string;
    date_from: string;
    date_to: string;
    pickup_time: string;
    return_time: string;
  }>) {
    const bStart = toMs(b.date_from, b.pickup_time);
    const bEnd = toMs(b.date_to, b.return_time);
    if (newStart < bEnd && bStart < newEnd) {
      return {
        kind: "booking",
        customerName: b.customer_name,
        from: `${b.date_from} ${b.pickup_time.slice(0, 5)}`,
        to: `${b.date_to} ${b.return_time.slice(0, 5)}`,
      };
    }
  }

  const { data: blocks, error: blkErr } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to, start_time, end_time, reason")
    .eq("bike_unit_id", args.bikeUnitId)
    .is("booking_id", null)
    .lte("date_from", args.dateTo)
    .gte("date_to", args.dateFrom);
  if (blkErr) throw new Error(`block conflict lookup: ${blkErr.message}`);
  for (const m of (blocks ?? []) as Array<{
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }>) {
    // Whole-day block overlaps anything on those dates; time-bounded
    // block only overlaps on actual time conflict.
    if (m.start_time && m.end_time) {
      const mStart = toMs(m.date_from, m.start_time);
      const mEnd = toMs(m.date_to, m.end_time);
      if (!(newStart < mEnd && mStart < newEnd)) continue;
    }
    return {
      kind: "block",
      from: m.date_from,
      to: m.date_to,
      reason: m.reason,
    };
  }
  return null;
}

// Walks the fleet and returns up to `count` free unit IDs. Used by
// the quantity-based walk-in path so the owner can say "book me 2
// units" without picking which two — the server figures it out from
// whichever units are actually free for the requested window.
export async function findFreeUnits(
  supabase: SupabaseClient,
  w: BookingWindow,
  count: number,
  opts: { includeBackup?: boolean } = {},
): Promise<{ unitIds: string[]; totalFree: number; totalUnits: number; conflict: Conflict | null }> {
  // Reuse the same conflict-collection logic as findFreeUnit, just
  // keep walking past the first match.
  const { data: manuals, error: manualErr } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to, start_time, end_time, bike_unit_id")
    .eq("bike_id", w.bikeId)
    .is("booking_id", null)
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (manualErr) throw new Error(`manual block lookup: ${manualErr.message}`);

  const newStart = toMs(w.dateFrom, w.pickupTime);
  const newEnd = toMs(w.dateTo, w.returnTime);

  function overlapsManual(m: {
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
  }): boolean {
    if (!m.start_time || !m.end_time) return true;
    const mStart = toMs(m.date_from, m.start_time);
    const mEnd = toMs(m.date_to, m.end_time);
    return newStart < mEnd && mStart < newEnd;
  }

  const blockedUnitIds = new Set<string>();
  let modelWideBlock: { date_from: string; date_to: string } | null = null;
  for (const m of (manuals ?? []) as Array<{
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
    bike_unit_id: string | null;
  }>) {
    if (!overlapsManual(m)) continue;
    if (m.bike_unit_id === null) {
      modelWideBlock = { date_from: m.date_from, date_to: m.date_to };
      break;
    }
    blockedUnitIds.add(m.bike_unit_id);
  }

  let unitQuery = supabase
    .from("bike_units")
    .select("id, label")
    .eq("bike_id", w.bikeId)
    .eq("active", true);
  if (!opts.includeBackup) unitQuery = unitQuery.eq("is_backup", false);
  const { data: units, error: unitErr } = await unitQuery.order("label", {
    ascending: true,
  });
  if (unitErr) throw new Error(`unit lookup: ${unitErr.message}`);
  const allUnits = (units ?? []) as Array<{ id: string; label: string }>;
  if (allUnits.length === 0) {
    return { unitIds: [], totalFree: 0, totalUnits: 0, conflict: { kind: "no_units" } };
  }
  if (modelWideBlock) {
    return {
      unitIds: [],
      totalFree: 0,
      totalUnits: allUnits.length,
      conflict: { kind: "manual", from: modelWideBlock.date_from, to: modelWideBlock.date_to },
    };
  }

  let q = supabase
    .from("bookings")
    .select("id, bike_unit_id, date_from, date_to, pickup_time, return_time, customer_name")
    .eq("bike_id", w.bikeId)
    .in("status", ["confirmed", "pending"])
    // Returned bikes are free again immediately, ignore them.
    .is("returned_at", null)
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (w.excludeBookingId) q = q.neq("id", w.excludeBookingId);
  const { data: candidates, error: bookErr } = await q;
  if (bookErr) throw new Error(`booking overlap lookup: ${bookErr.message}`);

  type Cand = {
    id: string;
    bike_unit_id: string | null;
    date_from: string;
    date_to: string;
    pickup_time: string;
    return_time: string;
    customer_name: string;
  };
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const occupied = new Set<string>();
  let lastBookingConflict: Cand | null = null;
  for (const c of ((candidates ?? []) as Cand[])) {
    const cStart = toMs(c.date_from, c.pickup_time);
    const cEnd = toMs(c.date_to, c.return_time);
    if (newStart < cEnd + bufferMs && cStart - bufferMs < newEnd) {
      if (c.bike_unit_id) occupied.add(c.bike_unit_id);
      lastBookingConflict = c;
    }
  }

  const freeUnits = allUnits.filter(
    (u) => !occupied.has(u.id) && !blockedUnitIds.has(u.id),
  );
  const picked = freeUnits.slice(0, count).map((u) => u.id);
  let conflict: Conflict | null = null;
  if (picked.length < count && lastBookingConflict) {
    conflict = {
      kind: "booking",
      id: lastBookingConflict.id,
      customerName: lastBookingConflict.customer_name,
      dateFrom: lastBookingConflict.date_from,
      dateTo: lastBookingConflict.date_to,
      pickupTime: lastBookingConflict.pickup_time,
      returnTime: lastBookingConflict.return_time,
    };
  }
  return {
    unitIds: picked,
    totalFree: freeUnits.length,
    totalUnits: allUnits.length,
    conflict,
  };
}

// Human-readable reason for showing in toasts / error pages.
export function describeConflict(c: Conflict): string {
  if (c.kind === "manual") return `manual owner block ${c.from} → ${c.to}`;
  if (c.kind === "no_units") return "no physical units configured for this bike";
  return `${c.customerName} (${c.dateFrom} ${c.pickupTime} → ${c.dateTo} ${c.returnTime})`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Smart suggestion: when a bike is fully booked for the requested
// window, find the nearest LATER window of the SAME duration (same
// pickup/return times, shifted by whole days) where at least one unit
// is free. Lets the customer re-plan instead of just seeing "sold out".
// Steps one day at a time up to `horizonDays`; stops at the season end.
export async function nextFreeWindow(
  supabase: SupabaseClient,
  w: BookingWindow,
  opts: { horizonDays?: number; seasonEndIso?: string } = {},
): Promise<{ dateFrom: string; dateTo: string } | null> {
  const horizon = opts.horizonDays ?? 14;
  for (let shift = 1; shift <= horizon; shift++) {
    const dateFrom = addDaysIso(w.dateFrom, shift);
    const dateTo = addDaysIso(w.dateTo, shift);
    if (opts.seasonEndIso && dateTo > opts.seasonEndIso) break;
    const res = await findFreeUnits(supabase, { ...w, dateFrom, dateTo }, 1);
    if (res.unitIds.length >= 1) return { dateFrom, dateTo };
  }
  return null;
}

// Same-day smart hint: when a bike is full at the requested pickup time,
// find the earliest LATER pickup slot on the start date at which at least
// one unit frees up (e.g. booked until 15:00 → free from 15:30 with the
// turnaround buffer). Returns the "HH:MM" slot, or null if there's no
// later same-day window (caller then falls back to nextFreeWindow). One
// DB load, then evaluated in memory with the same overlap + buffer rules
// as findFreeUnits, so it never contradicts the real availability check.
export async function earliestFreePickupSameDay(
  supabase: SupabaseClient,
  w: BookingWindow,
): Promise<string | null> {
  const { data: units, error: unitErr } = await supabase
    .from("bike_units")
    .select("id")
    .eq("bike_id", w.bikeId)
    .eq("active", true)
    .eq("is_backup", false);
  if (unitErr) throw new Error(`unit lookup: ${unitErr.message}`);
  const unitIds = (units ?? []).map((u) => (u as { id: string }).id);
  if (unitIds.length === 0) return null;

  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("bike_unit_id, date_from, date_to, pickup_time, return_time")
    .eq("bike_id", w.bikeId)
    .in("status", ["confirmed", "pending"])
    .is("returned_at", null)
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (bErr) throw new Error(`booking lookup: ${bErr.message}`);

  const { data: blocks, error: blkErr } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to, start_time, end_time, bike_unit_id")
    .eq("bike_id", w.bikeId)
    .is("booking_id", null)
    .lte("date_from", w.dateTo)
    .gte("date_to", w.dateFrom);
  if (blkErr) throw new Error(`block lookup: ${blkErr.message}`);

  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const reqPickupMs = toMs(w.dateFrom, w.pickupTime);
  const endMs = toMs(w.dateTo, w.returnTime);

  for (const slot of buildSlots()) {
    const slotMs = toMs(w.dateFrom, slot);
    if (slotMs <= reqPickupMs) continue; // only later than what they asked
    if (slotMs >= endMs) break; // pickup must stay before the return moment

    const occupied = new Set<string>();
    let wholeModelBlocked = false;
    for (const m of (blocks ?? []) as Array<{
      date_from: string; date_to: string; start_time: string | null; end_time: string | null; bike_unit_id: string | null;
    }>) {
      const overlaps =
        !m.start_time || !m.end_time
          ? true
          : slotMs < toMs(m.date_to, m.end_time) && toMs(m.date_from, m.start_time) < endMs;
      if (!overlaps) continue;
      if (m.bike_unit_id === null) { wholeModelBlocked = true; break; }
      occupied.add(m.bike_unit_id);
    }
    if (wholeModelBlocked) continue;

    for (const b of (bookings ?? []) as Array<{
      bike_unit_id: string | null; date_from: string; date_to: string; pickup_time: string; return_time: string;
    }>) {
      const cStart = toMs(b.date_from, b.pickup_time);
      const cEnd = toMs(b.date_to, b.return_time);
      if (slotMs < cEnd + bufferMs && cStart - bufferMs < endMs) {
        if (b.bike_unit_id) occupied.add(b.bike_unit_id);
      }
    }

    if (unitIds.some((id) => !occupied.has(id))) return slot;
  }
  return null;
}

// Look up the human-friendly label for a unit ID (e.g. "Liberty50-2").
// Returns null if the unit can't be resolved . caller decides how to
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
