import type { SupabaseClient } from "@supabase/supabase-js";
import { TURNAROUND_MINUTES, SLOT_MINUTES, buildSlots, buildPickupSlots } from "@/lib/pricing";

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
  // Group re-validation: ignore an ENTIRE booking group (all its rows) so a
  // group confirm doesn't count its own pending rows against itself.
  excludeGroupId?: string;
};

// One booking that is out at the peak instant (for the "why is it full" list).
export type ConflictBooking = {
  customerName: string;
  dateFrom: string;
  dateTo: string;
  pickupTime: string;
  returnTime: string;
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
      // The moment the model is at capacity (epoch ms) and EVERY booking out at
      // that moment, so the owner sees exactly why there's no free bike instead
      // of having to recompute the whole calendar by hand. Stored raw so it can
      // be formatted per locale at render time.
      peakAtMs?: number;
      peakBookings?: ConflictBooking[];
      // Fleet size (K) at that moment, for "all 4 out" wording.
      capacity?: number;
    }
  | { kind: "no_units" };

export type AvailabilityResult = {
  // Set when at least one physical unit is free for the window.
  unitId: string | null;
  // Set when no unit can take the window. Carries enough detail for
  // a useful error message.
  conflict: Conflict | null;
};

// Render an epoch-ms (built by toMs, i.e. a Zagreb wall-clock instant) back to
// "15 Jul 15:00" in the shop's timezone, for conflict messages (English - the
// admin, incl. Priscilla, reads English).
const ZAGREB_INSTANT_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zagreb",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function fmtInstant(ms: number): string {
  return ZAGREB_INSTANT_FMT.format(new Date(ms)).replace(",", "");
}

// "15 Jul" / "15 Jul 15:00" from an ISO date (+ optional HH:MM) - no timezone
// math needed, the strings are already Zagreb wall-clock.
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function enDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${EN_MONTHS[Number(m) - 1]}`;
}
function enDateTime(iso: string, time: string): string {
  return `${enDate(iso)} ${time.slice(0, 5)}`;
}

function toMs(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`).getTime();
}

// If the owner never taps "returned", assume it came back 24h after the
// scheduled return. Keep this in lockstep with bucketBookings' AUTO_FALLBACK_MS
// so the "Currently out" list and the fleet/unit/badge counts never disagree.
export const RETURN_AUTO_FALLBACK_MS = 24 * 60 * 60_000;

// Occupancy interval for "is this unit physically out RIGHT NOW" displays
// (fleet card, per-unit panel, reserve tile, homepage badge). Defined ONCE so
// every surface counts identically. returned_at rows are filtered upstream.
//
//  - not picked up  -> occupies its scheduled window [schedStart, schedEnd]
//  - picked up      -> out from min(pickup-proxy, now) until its scheduled
//                      return; if never marked returned it lingers at most 24h
//                      past that, then auto-forgiven. Without the cap an old
//                      un-returned June rental would count as "out" forever and
//                      contradict the "Currently out" list (which auto-forgives
//                      after 24h) -> the "2 out but only 1 out" report.
export function occupancyInterval(
  schedStart: number,
  schedEnd: number,
  pickedUp: boolean,
  nowMs: number,
): { start: number; end: number } {
  if (!pickedUp) return { start: schedStart, end: schedEnd };
  return {
    start: Math.min(schedStart, nowMs),
    end: Math.min(Math.max(schedEnd, nowMs + 60_000), schedEnd + RETURN_AUTO_FALLBACK_MS),
  };
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
  if (w.excludeGroupId) {
    // NULL-safe group exclusion. `.neq` compiles to SQL `col <> uuid`, which
    // evaluates to NULL (not TRUE) for solo bookings where booking_group_id IS
    // NULL, silently dropping them from the demand set -> under-counting ->
    // overbooking. Keep NULL-group (solo) rows; drop only THIS group's own rows
    // (they move together and must not conflict with themselves).
    q = q.or(`booking_group_id.is.null,booking_group_id.neq.${w.excludeGroupId}`);
  }
  const { data: candidates, error: bookErr } = await q;
  if (bookErr) throw new Error(`booking overlap lookup: ${bookErr.message}`);

  // 4. Capacity model (NOT "one fixed free unit"). A customer is never pinned
  //    to a physical bike — they get any one of the K units and keep it for the
  //    rental. So a booking is allowed as long as at no instant of its window
  //    are MORE bikes needed at once than exist. Demand at an instant =
  //    overlapping bookings (with turnaround buffer, ANY unit incl. unassigned)
  //    + per-unit service blocks active then. (Whole-model blocks were already
  //    rejected in step 1.) This is the interval-overlap rule: peak <= K means
  //    a valid assignment always exists, so greedy fragmentation never wrongly
  //    rejects a booking that actually fits.
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const newStart = toMs(w.dateFrom, w.pickupTime);
  const newEnd = toMs(w.dateTo, w.returnTime);
  const K = units.length;
  // Units that count toward THIS pool. A booking pinned to a unit not in the
  // pool (a backup/ghost unit when !includeBackup, or an inactive unit) is
  // off-the-books here: the reserve is excluded from K, so its bookings must
  // not count against K either. Without this, a ghost-parked rental inflates
  // demand and falsely rejects a regular booking, even though every display
  // already treats the regular unit as free.
  const poolUnitIds = new Set(units.map((u) => u.id));

  type Cand = {
    id: string; bike_unit_id: string | null; date_from: string; date_to: string;
    pickup_time: string; return_time: string; customer_name: string;
  };
  const overlapping: Cand[] = [];
  const occupied = new Set<string>();
  for (const c of (candidates ?? []) as Cand[]) {
    if (c.bike_unit_id && !poolUnitIds.has(c.bike_unit_id)) continue;
    const cStart = toMs(c.date_from, c.pickup_time);
    const cEnd = toMs(c.date_to, c.return_time);
    if (newStart < cEnd + bufferMs && cStart - bufferMs < newEnd) {
      overlapping.push(c);
      if (c.bike_unit_id) occupied.add(c.bike_unit_id);
    }
  }

  // Per-unit service blocks overlapping the window, with their time span.
  // A block pinned to a unit OUTSIDE the pool (the ghost/backup reserve, or
  // an inactive unit) must not consume regular capacity — mirror of the
  // pool check on bookings above.
  const blockSpans: Array<{ start: number; end: number }> = [];
  for (const m of (manuals ?? []) as Array<{
    date_from: string; date_to: string; start_time: string | null; end_time: string | null; bike_unit_id: string | null;
  }>) {
    if (!m.bike_unit_id || !occupiedByManual.has(m.bike_unit_id)) continue; // whole-model handled above
    if (!poolUnitIds.has(m.bike_unit_id)) continue;
    const ms = m.start_time ? toMs(m.date_from, m.start_time) : toMs(m.date_from, "00:00");
    const me = m.end_time ? toMs(m.date_to, m.end_time) : toMs(m.date_to, "23:59");
    blockSpans.push({ start: ms, end: me });
  }

  // Peak simultaneous demand inside [newStart, newEnd). A bike is committed
  // from its pickup until its return PLUS the 30-min turnaround (cleaning),
  // i.e. [pickup, return + buffer). The buffer is ONLY after the return, never
  // before the pickup - otherwise two legit back-to-back rentals exactly one
  // turnaround apart (return 11:00, next pickup 11:30) get double-counted as
  // needing two bikes. Demand can only rise at a booking's pickup or a block
  // start, so evaluate exactly there.
  const instants = [newStart];
  for (const c of overlapping) instants.push(toMs(c.date_from, c.pickup_time));
  for (const b of blockSpans) instants.push(b.start);
  let existingPeak = 0;
  let peakT = newStart; // the instant where the peak happens (for the message)
  for (const t of instants) {
    if (t < newStart || t >= newEnd) continue;
    let demand = 0;
    for (const c of overlapping) {
      if (toMs(c.date_from, c.pickup_time) <= t && t < toMs(c.date_to, c.return_time) + bufferMs) demand++;
    }
    for (const b of blockSpans) {
      if (b.start <= t && t < b.end) demand++;
    }
    if (demand > existingPeak) {
      existingPeak = demand;
      peakT = t;
    }
  }

  // 5. Room for THIS booking on top of the peak? Assign a genuinely-free unit
  //    when one exists (handy for the owner / ghost-bike / service tracking);
  //    otherwise leave it unassigned (null) — capacity is proven, we just don't
  //    pin a physical bike. Either way the booking is allowed.
  if (existingPeak + 1 <= K) {
    const free = units.find((u) => !occupied.has(u.id) && !occupiedByManual.has(u.id));
    return { unitId: free ? free.id : null, conflict: null };
  }

  // 6. Genuinely full (a K+1-th bike would be needed at some instant). Surface
  //    the FULL picture: every booking out at the peak instant, so the owner
  //    sees exactly why there's no free bike instead of recomputing by hand.
  const peakOut = overlapping.filter(
    (c) =>
      toMs(c.date_from, c.pickup_time) <= peakT &&
      peakT < toMs(c.date_to, c.return_time) + bufferMs,
  );
  const peakBookings = peakOut.map((c) => ({
    customerName: c.customer_name,
    dateFrom: c.date_from,
    dateTo: c.date_to,
    pickupTime: c.pickup_time.slice(0, 5),
    returnTime: c.return_time.slice(0, 5),
  }));
  const rep = peakOut.length ? peakOut[peakOut.length - 1] : overlapping.length ? overlapping[overlapping.length - 1] : null;
  if (rep) {
    return {
      unitId: null,
      conflict: {
        kind: "booking",
        id: rep.id,
        customerName: rep.customer_name,
        dateFrom: rep.date_from,
        dateTo: rep.date_to,
        pickupTime: rep.pickup_time.slice(0, 5),
        returnTime: rep.return_time.slice(0, 5),
        peakAtMs: peakT,
        peakBookings,
        capacity: K,
      },
    };
  }
  const firstBlock = (manuals ?? []).find((m) => m.bike_unit_id);
  if (firstBlock) {
    return { unitId: null, conflict: { kind: "manual", from: firstBlock.date_from, to: firstBlock.date_to } };
  }
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
  // Same 30-min turnaround buffer the public engine (findFreeUnit/
  // findFreeUnits) applies, so admin/Telegram bookings honour the same
  // gap between two rentals on one unit. Blocks below stay unbuffered.
  const bufferMs = TURNAROUND_MINUTES * 60_000;

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
    if (newStart < bEnd + bufferMs && bStart - bufferMs < newEnd) {
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
): Promise<{ unitIds: (string | null)[]; totalFree: number; totalUnits: number; conflict: Conflict | null }> {
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
  if (w.excludeGroupId) {
    // NULL-safe group exclusion. `.neq` compiles to SQL `col <> uuid`, which
    // evaluates to NULL (not TRUE) for solo bookings where booking_group_id IS
    // NULL, silently dropping them from the demand set -> under-counting ->
    // overbooking. Keep NULL-group (solo) rows; drop only THIS group's own rows
    // (they move together and must not conflict with themselves).
    q = q.or(`booking_group_id.is.null,booking_group_id.neq.${w.excludeGroupId}`);
  }
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
  // Capacity model (same as findFreeUnit): how many MORE bikes fit on top of
  // the peak simultaneous demand inside the window? Count every overlapping
  // booking (any unit incl. unassigned) + per-unit service blocks.
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const K = allUnits.length;
  // See findFreeUnit: a booking pinned to a unit outside this pool (backup/
  // ghost when !includeBackup, or inactive) is off-the-books and must not
  // count against K.
  const poolUnitIds = new Set(allUnits.map((u) => u.id));
  const overlapping: Cand[] = [];
  const occupied = new Set<string>();
  let lastBookingConflict: Cand | null = null;
  for (const c of ((candidates ?? []) as Cand[])) {
    if (c.bike_unit_id && !poolUnitIds.has(c.bike_unit_id)) continue;
    const cStart = toMs(c.date_from, c.pickup_time);
    const cEnd = toMs(c.date_to, c.return_time);
    if (newStart < cEnd + bufferMs && cStart - bufferMs < newEnd) {
      overlapping.push(c);
      if (c.bike_unit_id) occupied.add(c.bike_unit_id);
      lastBookingConflict = c;
    }
  }
  const blockSpans: Array<{ start: number; end: number }> = [];
  for (const m of (manuals ?? []) as Array<{
    date_from: string; date_to: string; start_time: string | null; end_time: string | null; bike_unit_id: string | null;
  }>) {
    if (!m.bike_unit_id || !blockedUnitIds.has(m.bike_unit_id)) continue;
    // Blocks on out-of-pool units (ghost/backup reserve) don't consume K.
    if (!poolUnitIds.has(m.bike_unit_id)) continue;
    const ms = m.start_time ? toMs(m.date_from, m.start_time) : toMs(m.date_from, "00:00");
    const me = m.end_time ? toMs(m.date_to, m.end_time) : toMs(m.date_to, "23:59");
    blockSpans.push({ start: ms, end: me });
  }
  const instants = [newStart];
  for (const c of overlapping) instants.push(toMs(c.date_from, c.pickup_time)); // buffer is return-side only
  for (const b of blockSpans) instants.push(b.start);
  let existingPeak = 0;
  for (const t of instants) {
    if (t < newStart || t >= newEnd) continue;
    let dem = 0;
    for (const c of overlapping) if (toMs(c.date_from, c.pickup_time) <= t && t < toMs(c.date_to, c.return_time) + bufferMs) dem++;
    for (const b of blockSpans) if (b.start <= t && t < b.end) dem++;
    if (dem > existingPeak) existingPeak = dem;
  }

  const remaining = Math.max(0, K - existingPeak);
  const fits = Math.min(count, remaining);
  // Assign a genuinely-free physical unit where one exists, pad the rest with
  // null (unassigned) — the customer just gets one of the K bikes.
  const freeReal = allUnits
    .filter((u) => !occupied.has(u.id) && !blockedUnitIds.has(u.id))
    .map((u) => u.id);
  const picked: (string | null)[] = [];
  for (let i = 0; i < fits; i++) picked.push(i < freeReal.length ? freeReal[i] : null);
  let conflict: Conflict | null = null;
  if (fits < count && lastBookingConflict) {
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
    totalFree: remaining,
    totalUnits: allUnits.length,
    conflict,
  };
}

// Human-readable one-line reason (fallback / toasts). The structured card
// (buildConflictCard) is preferred where a UI can render it.
export function describeConflict(c: Conflict): string {
  if (c.kind === "manual") return `blocked for service ${enDate(c.from)} → ${enDate(c.to)}`;
  if (c.kind === "no_units") return "no bikes configured for this model";
  if (c.peakBookings && c.peakBookings.length > 0) {
    const cap = c.capacity ?? c.peakBookings.length;
    const list = c.peakBookings
      .map((b) => `${b.customerName} (until ${enDateTime(b.dateTo, b.returnTime)})`)
      .join(", ");
    return `all ${cap} out${c.peakAtMs ? ` at ${fmtInstant(c.peakAtMs)}` : ""}: ${list}`;
  }
  return `${c.customerName} (${enDateTime(c.dateFrom, c.pickupTime)} → ${enDateTime(c.dateTo, c.returnTime)})`;
}

// Data for the owner-facing conflict CARD: WHAT / WHY / WHO has each bike / a
// concrete "would fit if" suggestion. Rendered mobile-first in the walk-in and
// edit forms so a conflict is obvious at a glance.
export type ConflictCardData = {
  headline: string;
  window: string;
  reason: string;
  out: Array<{ name: string; back: string }>;
  suggestion: string | null;
};

export async function buildConflictCard(
  supabase: SupabaseClient,
  w: BookingWindow,
  conflict: Conflict,
  modelName: string,
  opts: { seasonEndIso?: string } = {},
): Promise<ConflictCardData> {
  const window = `${enDateTime(w.dateFrom, w.pickupTime)} → ${enDateTime(w.dateTo, w.returnTime)}`;
  if (conflict.kind === "manual") {
    return {
      headline: `${modelName} blocked`,
      window,
      reason: `This model is blocked for service ${enDate(conflict.from)} → ${enDate(conflict.to)}.`,
      out: [],
      suggestion: null,
    };
  }
  if (conflict.kind === "no_units") {
    return { headline: `No ${modelName}`, window, reason: "This model has no bookable bikes set up.", out: [], suggestion: null };
  }
  const cap = conflict.capacity ?? conflict.peakBookings?.length ?? 0;
  const bookings = conflict.peakBookings ?? [
    { customerName: conflict.customerName, dateFrom: conflict.dateFrom, dateTo: conflict.dateTo, pickupTime: conflict.pickupTime, returnTime: conflict.returnTime },
  ];
  const out = bookings.map((b) => ({ name: b.customerName, back: enDateTime(b.dateTo, b.returnTime) }));

  // Concrete "would fit if" hint - same functions the fleet page uses.
  let suggestion: string | null = null;
  try {
    const earliest = await earliestFreePickupSameDay(supabase, w);
    if (earliest) suggestion = `Pick up from ${earliest} the same day`;
    else {
      const latest = await latestFreeReturnSameDay(supabase, w);
      if (latest) suggestion = `Return by ${latest} the same day`;
      else {
        const next = await nextFreeWindow(supabase, w, { seasonEndIso: opts.seasonEndIso });
        if (next) suggestion = `Next free: ${enDateTime(next.dateFrom, next.pickupTime)}`;
      }
    }
  } catch {
    // best-effort; a missing suggestion just omits that line.
  }

  return {
    headline: `No free ${modelName}`,
    window,
    reason:
      cap > 0
        ? `All ${cap} bikes are out${conflict.peakAtMs ? ` at ${fmtInstant(conflict.peakAtMs)}` : ""} - none free for this window.`
        : "No free bike for this window.",
    out,
    suggestion,
  };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Smart suggestion: when a bike is fully booked for the requested
// window, find the nearest LATER window of the SAME duration (shifted by
// whole days) where at least one unit is free, AND the earliest pickup
// time on that day at which it frees up. Lets the customer re-plan with a
// concrete date + time instead of just seeing "sold out". One DB load
// across the horizon, then evaluated in memory with the same overlap +
// buffer rules as findFreeUnits so the hint never contradicts the real
// check. Steps one day at a time up to `horizonDays`; stops at season end.
export async function nextFreeWindow(
  supabase: SupabaseClient,
  w: BookingWindow,
  opts: { horizonDays?: number; seasonEndIso?: string } = {},
): Promise<{ dateFrom: string; dateTo: string; pickupTime: string } | null> {
  const horizon = opts.horizonDays ?? 14;
  const minFrom = addDaysIso(w.dateFrom, 1);
  const maxTo = addDaysIso(w.dateTo, horizon);

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
    .lte("date_from", maxTo)
    .gte("date_to", minFrom);
  if (bErr) throw new Error(`booking lookup: ${bErr.message}`);

  const { data: blocks, error: blkErr } = await supabase
    .from("blocked_dates")
    .select("date_from, date_to, start_time, end_time, bike_unit_id")
    .eq("bike_id", w.bikeId)
    .is("booking_id", null)
    .lte("date_from", maxTo)
    .gte("date_to", minFrom);
  if (blkErr) throw new Error(`block lookup: ${blkErr.message}`);

  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const blockRows = (blocks ?? []) as Array<{
    date_from: string; date_to: string; start_time: string | null; end_time: string | null; bike_unit_id: string | null;
  }>;
  const bookingRows = (bookings ?? []) as Array<{
    bike_unit_id: string | null; date_from: string; date_to: string; pickup_time: string; return_time: string;
  }>;

  for (let shift = 1; shift <= horizon; shift++) {
    const dateFrom = addDaysIso(w.dateFrom, shift);
    const dateTo = addDaysIso(w.dateTo, shift);
    if (opts.seasonEndIso && dateTo > opts.seasonEndIso) break;
    const endMs = toMs(dateTo, w.returnTime);

    // Pickup candidates only — never suggest a 19:00 pickup (closing).
    for (const slot of buildPickupSlots()) {
      const slotMs = toMs(dateFrom, slot);
      if (slotMs >= endMs) break;

      // Capacity count (conservative): overlapping bookings (incl. unassigned)
      // + per-unit blocks. Free iff below fleet size, so this never advertises
      // a window the real findFreeUnits gate would reject.
      let demand = 0;
      let wholeModelBlocked = false;
      for (const m of blockRows) {
        const overlaps =
          !m.start_time || !m.end_time
            ? m.date_from <= dateTo && m.date_to >= dateFrom
            : slotMs < toMs(m.date_to, m.end_time) && toMs(m.date_from, m.start_time) < endMs;
        if (!overlaps) continue;
        if (m.bike_unit_id === null) { wholeModelBlocked = true; break; }
        if (!unitIds.includes(m.bike_unit_id)) continue; // ghost/backup block: off-the-books for regular K
        demand++;
      }
      if (wholeModelBlocked) continue;

      for (const b of bookingRows) {
        if (b.bike_unit_id && !unitIds.includes(b.bike_unit_id)) continue; // ghost/backup-parked: off-the-books for regular K
        const cStart = toMs(b.date_from, b.pickup_time);
        const cEnd = toMs(b.date_to, b.return_time);
        if (slotMs < cEnd + bufferMs && cStart - bufferMs < endMs) demand++;
      }

      if (demand < unitIds.length) return { dateFrom, dateTo, pickupTime: slot };
    }
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

  // Pickup candidates only — never suggest a 19:00 pickup (closing).
  for (const slot of buildPickupSlots()) {
    const slotMs = toMs(w.dateFrom, slot);
    if (slotMs <= reqPickupMs) continue; // only later than what they asked
    if (slotMs >= endMs) break; // pickup must stay before the return moment

    let demand = 0;
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
      if (!unitIds.includes(m.bike_unit_id)) continue; // ghost/backup block: off-the-books for regular K
      demand++;
    }
    if (wholeModelBlocked) continue;

    for (const b of (bookings ?? []) as Array<{
      bike_unit_id: string | null; date_from: string; date_to: string; pickup_time: string; return_time: string;
    }>) {
      if (b.bike_unit_id && !unitIds.includes(b.bike_unit_id)) continue; // ghost/backup-parked: off-the-books for regular K
      const cStart = toMs(b.date_from, b.pickup_time);
      const cEnd = toMs(b.date_to, b.return_time);
      if (slotMs < cEnd + bufferMs && cStart - bufferMs < endMs) demand++;
    }

    // Conservative capacity count (counts unassigned): never suggests a slot
    // the real gate would reject.
    if (demand < unitIds.length) return slot;
  }
  return null;
}

// Same-day smart hint, return side: when a bike is full at the requested
// return time (because a LATER booking needs it, e.g. someone else picks
// it up at 18:00), find the LATEST earlier return slot at which the
// window [requested pickup .. that return] still has a free unit (so
// 18:00 next pickup → return by 17:30 with the turnaround buffer).
// Returns the "HH:MM" slot, or null when shrinking the return doesn't
// help (the conflict is on the pickup side). Same one-load, in-memory
// overlap + buffer rules as findFreeUnits, so it never contradicts it.
export async function latestFreeReturnSameDay(
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
  const startMs = toMs(w.dateFrom, w.pickupTime);
  const reqReturnMs = toMs(w.dateTo, w.returnTime);

  // Walk return slots from latest to earliest; first one that frees a
  // unit (and stays after the pickup) is the best "return earlier" hint.
  for (const slot of [...buildSlots()].reverse()) {
    const slotMs = toMs(w.dateTo, slot);
    if (slotMs >= reqReturnMs) continue; // only EARLIER than requested
    if (slotMs <= startMs) break; // return must stay after pickup

    let demand = 0;
    let wholeModelBlocked = false;
    for (const m of (blocks ?? []) as Array<{
      date_from: string; date_to: string; start_time: string | null; end_time: string | null; bike_unit_id: string | null;
    }>) {
      const overlaps =
        !m.start_time || !m.end_time
          ? true
          : startMs < toMs(m.date_to, m.end_time) && toMs(m.date_from, m.start_time) < slotMs;
      if (!overlaps) continue;
      if (m.bike_unit_id === null) { wholeModelBlocked = true; break; }
      if (!unitIds.includes(m.bike_unit_id)) continue; // ghost/backup block: off-the-books for regular K
      demand++;
    }
    if (wholeModelBlocked) continue;

    for (const b of (bookings ?? []) as Array<{
      bike_unit_id: string | null; date_from: string; date_to: string; pickup_time: string; return_time: string;
    }>) {
      if (b.bike_unit_id && !unitIds.includes(b.bike_unit_id)) continue; // ghost/backup-parked: off-the-books for regular K
      const cStart = toMs(b.date_from, b.pickup_time);
      const cEnd = toMs(b.date_to, b.return_time);
      if (startMs < cEnd + bufferMs && cStart - bufferMs < slotMs) demand++;
    }

    // Conservative capacity count (counts unassigned): never suggests a return
    // the real gate would reject.
    if (demand < unitIds.length) return slot;
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
    .select("label, is_backup")
    .eq("id", unitId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { label: string; is_backup: boolean };
  // Mark the hidden reserve so an owner card for a ghost-parked booking
  // never reads like a regular unit ("Liberty50-5" vs the actual Vespa).
  return row.is_backup ? `${row.label} · GHOST BIKE` : row.label;
}

// ---------------------------------------------------------------------------
// Calendar day status — THE single source of truth for "is this date
// pickupable at all?". The public calendar paints exactly this list; the
// same overlap + buffer rules as findFreeUnit are applied, so the calendar,
// the multi-booking fleet view and the submit check can never disagree.
// Pure function so it's unit-testable and callable from any surface.
// ---------------------------------------------------------------------------

export type CalendarBooking = {
  from: string; // YYYY-MM-DD
  to: string;
  pickupTime: string; // HH:MM
  returnTime: string;
  unitId: string | null;
};

export type CalendarBlock = {
  from: string;
  to: string;
  startTime: string | null; // HH:MM or null = whole-day
  endTime: string | null;
  unitId: string | null; // null = whole model
};

// Every future date on which NO pickup slot (09:00..18:30) can start a
// same-day rental on any unit. Mirrors findFreeUnit exactly: bookings
// block with the turnaround buffer, manual blocks without; whole-day
// blocks cover their whole date range; whole-model blocks take out all
// units at once. `now` is Zagreb wall-clock so "today" drops slots that
// have already passed at the shop.
export function blockedPickupDates(
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  unitIds: string[],
  now: { isoDate: string; minutesOfDay: number },
): string[] {
  if (unitIds.length === 0) return [];
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const slots = buildPickupSlots();

  // Only dates touched by a booking or block (plus today, whose slots
  // decay over the day) can possibly be blocked — everything else has
  // a free 09:00 by definition.
  const candidates = new Set<string>([now.isoDate]);
  const addRange = (from: string, to: string) => {
    let cur = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    // Guard against reversed/garbage rows: cap the walk at 400 days.
    for (let i = 0; cur.getTime() <= end.getTime() && i < 400; i++) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      candidates.add(`${y}-${m}-${d}`);
      cur = new Date(cur.getTime() + 86_400_000);
    }
  };
  for (const b of bookings) addRange(b.from, b.to);
  for (const m of blocks) addRange(m.from, m.to);

  const out: string[] = [];
  for (const iso of candidates) {
    if (iso < now.isoDate) continue;
    const closeMs = toMs(iso, "19:00");
    const everySlotBlocked = slots.every((slot) => {
      if (iso === now.isoDate) {
        const [h, mm] = slot.split(":").map(Number);
        if (h * 60 + mm <= now.minutesOfDay) return true; // already passed
      }
      const winStart = toMs(iso, slot);
      // A slot is bookable if a unit is free for at least a MINIMAL window
      // starting here (one slot) — NOT necessarily until closing. Otherwise a
      // short free gap before a later booking (unit free 09-13, booked 13+)
      // would mark the whole day as fully booked in the calendar, even though
      // a short same-day rental is genuinely possible then.
      const winEnd = Math.min(winStart + SLOT_MINUTES * 60_000, closeMs);
      if (winEnd <= winStart) return true;

      // Capacity: the slot is blocked only when as many bikes are already
      // needed at once as exist (no room for one more). Count overlapping
      // bookings (ANY unit incl. unassigned) + per-unit service blocks; a
      // whole-model block takes the day out entirely.
      let demand = 0;
      for (const m of blocks) {
        const overlaps =
          !m.startTime || !m.endTime
            ? m.from <= iso && iso <= m.to // whole-day: date containment
            : winStart < toMs(m.to, m.endTime) &&
              toMs(m.from, m.startTime) < winEnd;
        if (!overlaps) continue;
        if (m.unitId === null) return true; // whole model down
        if (!unitIds.includes(m.unitId)) continue; // ghost/backup block: off-the-books for regular K
        demand++;
      }
      for (const b of bookings) {
        const bStart = toMs(b.from, b.pickupTime);
        const bEnd = toMs(b.to, b.returnTime);
        if (winStart < bEnd + bufferMs && bStart - bufferMs < winEnd) demand++;
      }
      return demand >= unitIds.length;
    });
    if (everySlotBlocked) out.push(iso);
  }
  return out.sort();
}
