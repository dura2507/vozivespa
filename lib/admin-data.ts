import { CATEGORIES } from "@/lib/mockData";
import {
  getServiceClient,
  type BookingRow,
  type BlockedDateRow,
  type BikeUnitRow,
} from "@/lib/supabase";
import { signedReceiptUrl } from "@/lib/storage";
import {
  TURNAROUND_MINUTES,
  MIN_USEFUL_RENTAL_MINUTES,
  SHOP_OPEN_HOUR,
  SLOT_MINUTES,
  LAST_PICKUP_MINUTES,
} from "@/lib/pricing";
import { SEASON_END_ISO } from "@/lib/season";

export type EnrichedBooking = BookingRow & {
  bikeName: string;
  unitLabel: string | null;
  pickupAt: number; // ms
  returnAt: number;
  receiptUrl: string | null;
  // For a group (walk-in with several bikes): the whole booking's total
  // and how many bikes it spans, so every view can show the SAME "what
  // the customer paid" figure plus a breakdown. For a solo booking these
  // equal this row's own price / 1.
  groupTotalCents: number | null;
  groupSize: number;
  // Every bike in the group (including this row) so the admin sees ALL
  // reserved vehicles at a glance, not just the primary one. For a solo
  // booking this is a single-element list.
  groupBikes?: Array<{
    id: string;
    bikeName: string;
    unitLabel: string | null;
    ridingStyle: string | null;
    priceCents: number | null;
  }>;
};

export type EnrichedBlock = BlockedDateRow & {
  bikeName: string;
  // Friendly label of the locked unit, when the block targets a
  // specific unit. Null when the block covers the whole model.
  unitLabel: string | null;
};

export type FleetEntry = {
  bikeId: string;
  bikeName: string;
  totalUnits: number;
  // Units that are unavailable to a walk-in right now: physically out OR
  // reserved for an imminent pickup with no useful gap before it. Matches
  // the public availability logic so the dashboard ratio and the website
  // ("ausgebucht") never contradict each other.
  outUnits: number;
  // Of those, how many are NOT physically out yet but committed for a
  // pickup coming up soon. Shown as a "reserved" note so the owner can
  // tell the transitional state apart from bikes already handed over.
  reservedSoonCount: number;
  pendingCount: number;
  upcomingCount: number;
};

// All booking times in the DB are wall-clock Zagreb time. Vercel
// runs in UTC, so `new Date("2026-05-13T18:00:00")` would interpret
// 18:00 as UTC and put the pickup 2h later than the owner meant.
// We probe the actual Europe/Zagreb offset for that exact wallclock
// moment via Intl so DST is handled automatically (CET in winter,
// CEST in summer).
const SHOP_TZ = "Europe/Zagreb";
const tzFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function toMs(date: string, time: string | null | undefined): number {
  const t = time ? (time.length === 5 ? `${time}:00` : time) : "00:00:00";
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map(Number);
  // Treat the wallclock as UTC first; then ask "what would Zagreb
  // call that UTC instant?" and use the gap as the timezone offset.
  const asUtcMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  const parts = tzFormatter.formatToParts(new Date(asUtcMs)).reduce(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>,
  );
  const zagrebUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = zagrebUtcMs - asUtcMs;
  return asUtcMs - offsetMs;
}

// Admin uses the compact label so fleet cards and booking lists fit
// without truncation; falls back to the full model when no short name
// is defined.
function bikeName(id: string): string {
  const cat = CATEGORIES.find((c) => c.id === id);
  return cat?.shortName ?? cat?.model ?? id;
}

async function listUnitLabelMap(): Promise<Map<string, string>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("bike_units").select("id, label");
  if (error) throw new Error(error.message);
  const out = new Map<string, string>();
  for (const u of (data ?? []) as BikeUnitRow[]) out.set(u.id, u.label);
  return out;
}

// Pull every booking with derived fields used across the admin pages.
// Receipt URLs are signed in parallel so a list of 30 bookings doesn't
// turn into 30 sequential round-trips. Unit labels are joined client-
// side so we don't double-fetch from inside loops.
export async function listAllBookings(): Promise<EnrichedBooking[]> {
  const supabase = getServiceClient();
  const [bookingsRes, unitLabels] = await Promise.all([
    supabase.from("bookings").select("*").order("date_from", { ascending: false }),
    listUnitLabelMap(),
  ]);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const rows = (bookingsRes.data ?? []) as BookingRow[];

  // Group totals (sum + count) so every view shows the same whole-booking
  // figure for walk-in groups.
  const groupTotals = new Map<string, { sum: number; count: number }>();
  for (const b of rows) {
    if (!b.booking_group_id) continue;
    const g = groupTotals.get(b.booking_group_id) ?? { sum: 0, count: 0 };
    g.sum += b.total_price_cents ?? 0;
    g.count += 1;
    groupTotals.set(b.booking_group_id, g);
  }

  // The dashboard list only needs to know a receipt EXISTS
  // (deposit_screenshot_path), never the signed URL — so we don't mint
  // one signed Storage URL per booking here. That was ~85 storage round
  // trips on every dashboard load. The booking detail page mints the one
  // URL it actually shows via getBookingById.
  return rows.map((b) => {
    const g = b.booking_group_id ? groupTotals.get(b.booking_group_id) : null;
    return {
      ...b,
      bikeName: bikeName(b.bike_id),
      unitLabel: b.bike_unit_id ? unitLabels.get(b.bike_unit_id) ?? null : null,
      pickupAt: toMs(b.date_from, b.pickup_time),
      returnAt: toMs(b.date_to, b.return_time),
      receiptUrl: null,
      groupTotalCents: g ? g.sum : b.total_price_cents,
      groupSize: g ? g.count : 1,
    };
  });
}

export async function getBookingById(id: string): Promise<EnrichedBooking | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [url, unitLabels, group] = await Promise.all([
    data.deposit_screenshot_path
      ? signedReceiptUrl(data.deposit_screenshot_path).catch(() => null)
      : Promise.resolve<string | null>(null),
    listUnitLabelMap(),
    // Pull the group siblings so we can show the whole-booking total AND
    // every reserved bike, not just the primary row.
    data.booking_group_id
      ? supabase
          .from("bookings")
          .select("id, bike_id, bike_unit_id, riding_style, total_price_cents")
          .eq("booking_group_id", data.booking_group_id)
      : Promise.resolve({ data: null }),
  ]);
  type Sibling = {
    id: string;
    bike_id: string;
    bike_unit_id: string | null;
    riding_style: string | null;
    total_price_cents: number | null;
  };
  const siblings = (group as { data: Sibling[] | null }).data;
  const groupSize = siblings?.length ?? 1;
  const groupTotalCents = siblings
    ? siblings.reduce((s, b) => s + (b.total_price_cents ?? 0), 0)
    : data.total_price_cents;
  const toGroupBike = (b: {
    id: string;
    bike_id: string;
    bike_unit_id: string | null;
    riding_style: string | null;
    total_price_cents: number | null;
  }) => ({
    id: b.id,
    bikeName: bikeName(b.bike_id),
    unitLabel: b.bike_unit_id ? unitLabels.get(b.bike_unit_id) ?? null : null,
    ridingStyle: b.riding_style,
    priceCents: b.total_price_cents,
  });
  const groupBikes = siblings
    ? [...siblings].sort((a, b) => bikeName(a.bike_id).localeCompare(bikeName(b.bike_id))).map(toGroupBike)
    : [toGroupBike(data)];
  return {
    ...data,
    bikeName: bikeName(data.bike_id),
    unitLabel: data.bike_unit_id ? unitLabels.get(data.bike_unit_id) ?? null : null,
    pickupAt: toMs(data.date_from, data.pickup_time),
    returnAt: toMs(data.date_to, data.return_time),
    receiptUrl: url,
    groupTotalCents,
    groupSize,
    groupBikes,
  };
}

// Per-bike rollup for the admin Fleet section: total physical units,
// how many are currently out, plus pending/upcoming counts. "Out"
// covers both customer bookings and active per-unit service blocks
// so the owner sees a single accurate count.
export async function listFleetSummary(nowMs: number): Promise<FleetEntry[]> {
  const supabase = getServiceClient();
  const [unitsRes, bookingsRes, blocksRes] = await Promise.all([
    // Match the public availability + homepage counters: backup / reserve
    // units aren't part of the bookable fleet, so they must not inflate the
    // "total" or the "OUT" ratio. Without this the admin card showed 4/5 OUT
    // for a model where every rentable unit is actually out, and Thomas read
    // it as "one still available" — the opposite of the truth.
    supabase
      .from("bike_units")
      .select("id, bike_id")
      .eq("active", true)
      .eq("is_backup", false),
    supabase
      .from("bookings")
      .select("id, bike_id, bike_unit_id, status, date_from, date_to, pickup_time, return_time, returned_at"),
    supabase
      .from("blocked_dates")
      .select("bike_id, bike_unit_id, date_from, date_to, start_time, end_time")
      .is("booking_id", null),
  ]);
  if (unitsRes.error) throw new Error(unitsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);

  const unitsByBike = new Map<string, number>();
  // Set of unit ids that ARE part of the bookable fleet (non-backup). We
  // ignore bookings assigned to a backup unit for counting purposes — the
  // owner handed that unit out at their discretion and it doesn't belong
  // to the public capacity math. Without this a manual assignment to the
  // reserve would push OUT above total.
  const bookableUnitIds = new Set<string>();
  for (const u of (unitsRes.data ?? []) as Array<{ id: string; bike_id: string }>) {
    unitsByBike.set(u.bike_id, (unitsByBike.get(u.bike_id) ?? 0) + 1);
    bookableUnitIds.add(u.id);
  }

  type Acc = { outUnits: Set<string>; reservedUnits: Set<string>; pending: number; upcoming: number };
  const makeAcc = (): Acc => ({ outUnits: new Set(), reservedUnits: new Set(), pending: 0, upcoming: 0 });
  const getAcc = (bikeId: string, map: Map<string, Acc>): Acc => {
    let e = map.get(bikeId);
    if (!e) { e = makeAcc(); map.set(bikeId, e); }
    return e;
  };
  // A pickup this soon (with no useful rental fitting in the gap) means the
  // unit is effectively committed — a walk-in can't have it. Same rule the
  // public homepage uses, so the dashboard agrees with the website.
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const usefulMs = MIN_USEFUL_RENTAL_MINUTES * 60_000;

  const out = new Map<string, Acc>();
  for (const b of (bookingsRes.data ?? []) as Array<{
    id: string;
    bike_id: string;
    bike_unit_id: string | null;
    status: string;
    date_from: string;
    date_to: string;
    pickup_time: string;
    return_time: string;
    returned_at: string | null;
  }>) {
    const entry = getAcc(b.bike_id, out);
    if (b.status === "pending") entry.pending++;
    // Both confirmed AND pending block a unit, so both must count toward
    // OUT/upcoming, otherwise the fleet status contradicts what the public
    // availability check does (which uses `in ('confirmed','pending')`) and
    // Thomas sees "3 booked, only 1 counted" on the dashboard.
    if (b.status === "confirmed" || b.status === "pending") {
      // Returned early → unit is free again, don't count it as out.
      if (b.returned_at) continue;
      // Skip bookings on a backup unit — they're outside the public
      // capacity math (see bookableUnitIds above).
      if (b.bike_unit_id && !bookableUnitIds.has(b.bike_unit_id)) continue;
      const start = toMs(b.date_from, b.pickup_time);
      const end = toMs(b.date_to, b.return_time);
      // Prefer the unit id (dedupes if the same unit is somehow booked
      // twice); fall back to the row id so rows without an assigned unit
      // still count as one occupied slot, not zero.
      const key = b.bike_unit_id ?? `row:${b.id}`;
      if (start <= nowMs && end >= nowMs) {
        entry.outUnits.add(key);
      } else if (start > nowMs) {
        // Imminent pickup with no useful gap → reserved (counts as out).
        // Otherwise a genuine future booking → upcoming.
        if (start - bufferMs - nowMs < usefulMs) {
          entry.reservedUnits.add(key);
        } else {
          entry.upcoming++;
        }
      }
    }
  }
  // Manual blocks: per-unit blocks count an extra unit as out; whole-
  // model blocks mark every unit of that bike out.
  for (const m of (blocksRes.data ?? []) as Array<{
    bike_id: string;
    bike_unit_id: string | null;
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
  }>) {
    // Time-bounded block uses its real window; whole-day block covers
    // the full day(s).
    const start = m.start_time ? toMs(m.date_from, m.start_time) : toMs(m.date_from, "00:00");
    const end = m.end_time ? toMs(m.date_to, m.end_time) : toMs(m.date_to, "23:59") + 60_000;
    if (nowMs < start || nowMs > end) {
      // Future block — counted via upcomingCount instead.
      if (start > nowMs) {
        getAcc(m.bike_id, out).upcoming++;
      }
      continue;
    }
    const entry = getAcc(m.bike_id, out);
    if (m.bike_unit_id) {
      entry.outUnits.add(m.bike_unit_id);
    } else {
      // Whole-model block: every active unit is unavailable.
      const all = (unitsRes.data ?? []).filter((u) => u.bike_id === m.bike_id);
      for (const u of all) entry.outUnits.add(u.id);
    }
  }

  return CATEGORIES.map<FleetEntry>((cat) => {
    const entry = out.get(cat.id);
    // Committed = physically out ∪ reserved-for-imminent-pickup. Reserved
    // units already physically out (back-to-back) are only counted once.
    const committed = new Set(entry?.outUnits);
    let reservedSoon = 0;
    for (const key of entry?.reservedUnits ?? []) {
      if (!committed.has(key)) {
        committed.add(key);
        reservedSoon++;
      }
    }
    return {
      bikeId: cat.id,
      bikeName: cat.shortName ?? cat.model,
      totalUnits: unitsByBike.get(cat.id) ?? 0,
      outUnits: committed.size,
      reservedSoonCount: reservedSoon,
      pendingCount: entry?.pending ?? 0,
      upcomingCount: entry?.upcoming ?? 0,
    };
  });
}

// ---- Per-vehicle availability (Thomas's ask: "next free slot per bike") ----

export type UnitAvailability = {
  unitLabel: string;
  // out = physically with a customer now; reserved = free but committed
  // for a pickup coming up soon; free = available to a walk-in right now.
  status: "out" | "reserved" | "free";
  // When it comes back (out) or when the imminent pickup is (reserved).
  busyUntilMs: number | null;
  // Next moment this unit can be handed to a walk-in: shop hours, 30-min
  // turnaround, no 19:00 pickup. Equals now when free right now.
  nextFreePickupMs: number;
  // When that free window closes (next booking's pickup), null = open end.
  freeUntilMs: number | null;
};

export type FleetUnitAvailability = {
  bikeId: string;
  bikeName: string;
  units: UnitAvailability[];
};

// UTC ms → Zagreb wallclock parts (mirror of toMs, which goes the other way).
function zagrebParts(ms: number): { isoDate: string; minutesOfDay: number } {
  const parts = tzFormatter.formatToParts(new Date(ms)).reduce(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>,
  );
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: hour * 60 + Number(parts.minute),
  };
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Snap a raw moment to the next valid PICKUP slot: inside shop hours,
// on the 30-min grid, never after 18:30 (bumps to next day 09:00).
function bumpToPickupSlot(ms: number): number {
  const { isoDate, minutesOfDay } = zagrebParts(ms);
  if (minutesOfDay < SHOP_OPEN_HOUR * 60) return toMs(isoDate, "09:00");
  if (minutesOfDay > LAST_PICKUP_MINUTES) return toMs(addDaysIso(isoDate, 1), "09:00");
  const rounded = Math.ceil(minutesOfDay / SLOT_MINUTES) * SLOT_MINUTES;
  if (rounded > LAST_PICKUP_MINUTES) return toMs(addDaysIso(isoDate, 1), "09:00");
  const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
  const mm = String(rounded % 60).padStart(2, "0");
  return toMs(isoDate, `${hh}:${mm}`);
}

// Per bike model, per unit: current status + the next slot the owner can
// give it to a walk-in. Reserve/backup units are excluded like everywhere.
export async function listUnitAvailability(
  bikeId: string,
  nowMs: number,
): Promise<FleetUnitAvailability> {
  const supabase = getServiceClient();
  const [unitsRes, bookingsRes, blocksRes, labels] = await Promise.all([
    supabase
      .from("bike_units")
      .select("id")
      .eq("bike_id", bikeId)
      .eq("active", true)
      .eq("is_backup", false),
    supabase
      .from("bookings")
      .select("bike_unit_id, date_from, date_to, pickup_time, return_time, returned_at, status")
      .eq("bike_id", bikeId)
      .in("status", ["confirmed", "pending"])
      .is("returned_at", null),
    supabase
      .from("blocked_dates")
      .select("bike_unit_id, date_from, date_to, start_time, end_time")
      .eq("bike_id", bikeId)
      .is("booking_id", null),
    listUnitLabelMap(),
  ]);
  if (unitsRes.error) throw new Error(unitsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);

  const unitIds = (unitsRes.data ?? []).map((u) => (u as { id: string }).id);
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const usefulMs = MIN_USEFUL_RENTAL_MINUTES * 60_000;
  const seasonCutoff = toMs(SEASON_END_ISO, "23:59");

  // Collect busy intervals per unit. Whole-model blocks (unit_id null)
  // apply to every unit.
  const perUnit = new Map<string, Array<{ start: number; end: number }>>();
  for (const id of unitIds) perUnit.set(id, []);
  for (const b of (bookingsRes.data ?? []) as Array<{
    bike_unit_id: string | null; date_from: string; date_to: string; pickup_time: string; return_time: string;
  }>) {
    if (!b.bike_unit_id) continue;
    const arr = perUnit.get(b.bike_unit_id);
    if (arr) arr.push({ start: toMs(b.date_from, b.pickup_time), end: toMs(b.date_to, b.return_time) });
  }
  for (const m of (blocksRes.data ?? []) as Array<{
    bike_unit_id: string | null; date_from: string; date_to: string; start_time: string | null; end_time: string | null;
  }>) {
    const start = m.start_time ? toMs(m.date_from, m.start_time) : toMs(m.date_from, "00:00");
    const end = m.end_time ? toMs(m.date_to, m.end_time) : toMs(m.date_to, "23:59") + 60_000;
    const targets = m.bike_unit_id ? [m.bike_unit_id] : unitIds;
    for (const id of targets) {
      const arr = perUnit.get(id);
      if (arr) arr.push({ start, end });
    }
  }

  const units: UnitAvailability[] = unitIds.map((id) => {
    const intervals = (perUnit.get(id) ?? []).sort((a, b) => a.start - b.start);
    const current = intervals.find((iv) => nowMs >= iv.start && nowMs < iv.end) ?? null;
    const nextUpcoming = intervals.find((iv) => iv.start > nowMs) ?? null;

    // Where to start hunting for a free pickup: now, or once the current
    // rental is back with turnaround done.
    const searchFrom = current ? current.end + bufferMs : nowMs;
    let candidate = bumpToPickupSlot(searchFrom);
    for (let guard = 0; guard < 800 && candidate <= seasonCutoff; guard++) {
      const clash = intervals.find((iv) => candidate >= iv.start - bufferMs && candidate < iv.end + bufferMs);
      if (!clash) break;
      candidate = bumpToPickupSlot(clash.end + bufferMs);
    }
    const freeUntil = intervals.find((iv) => iv.start > candidate)?.start ?? null;

    let status: UnitAvailability["status"];
    let busyUntil: number | null;
    if (current) {
      status = "out";
      busyUntil = current.end;
    } else if (nextUpcoming && nextUpcoming.start - bufferMs - nowMs < usefulMs) {
      status = "reserved";
      busyUntil = nextUpcoming.start;
    } else {
      status = "free";
      busyUntil = null;
    }

    return {
      unitLabel: labels.get(id) ?? id.slice(0, 6),
      status,
      busyUntilMs: busyUntil,
      nextFreePickupMs: candidate,
      freeUntilMs: freeUntil,
    };
  });

  // Sort: free first, then reserved, then out — owner scans for what's
  // available now. Within a status, earliest next-free first.
  const order = { free: 0, reserved: 1, out: 2 };
  units.sort((a, b) => order[a.status] - order[b.status] || a.nextFreePickupMs - b.nextFreePickupMs);

  return { bikeId, bikeName: bikeName(bikeId), units };
}

export async function listManualBlocks(): Promise<EnrichedBlock[]> {
  const supabase = getServiceClient();
  const [{ data, error }, unitLabels] = await Promise.all([
    supabase
      .from("blocked_dates")
      .select("*")
      .is("booking_id", null)
      .order("date_from", { ascending: true }),
    listUnitLabelMap(),
  ]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => {
    const row = b as BlockedDateRow;
    return {
      ...row,
      bikeName: bikeName(row.bike_id),
      unitLabel: row.bike_unit_id ? unitLabels.get(row.bike_unit_id) ?? null : null,
    };
  });
}

// Active per-unit service blocks (right now or in the future) shown
// in the dashboard "Currently out / Upcoming" alongside customer
// bookings so the owner sees one combined fleet picture.
export type ServiceBlock = EnrichedBlock & {
  startMs: number;
  endMs: number;
};

export async function listServiceBlocks(): Promise<ServiceBlock[]> {
  const blocks = await listManualBlocks();
  return blocks.map((b) => ({
    ...b,
    // Time-bounded block (both times set): exact window. Whole-day
    // block: from 00:00 of date_from until 00:00 of the day after
    // date_to so a block on 12.05 covers all of the 12th.
    startMs: b.start_time ? toMs(b.date_from, b.start_time) : toMs(b.date_from, "00:00"),
    endMs: b.end_time
      ? toMs(b.date_to, b.end_time)
      : toMs(b.date_to, "23:59") + 60_000,
  }));
}

// Walk-in bookings are the ones created from the admin panel — they
// carry no payment_method (website flow always requires one). Used by
// /admin/blocks to merge them into the "Recent entries" list next to
// service blocks, so the page heading "Blocks & walk-ins" actually
// lists both.
export async function listWalkInBookings(): Promise<EnrichedBooking[]> {
  const supabase = getServiceClient();
  const [{ data, error }, unitLabels] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .is("payment_method", null)
      .neq("status", "cancelled")
      .neq("status", "declined")
      .order("date_from", { ascending: false }),
    listUnitLabelMap(),
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BookingRow[];
  const groupTotals = new Map<string, { sum: number; count: number }>();
  for (const b of rows) {
    if (!b.booking_group_id) continue;
    const g = groupTotals.get(b.booking_group_id) ?? { sum: 0, count: 0 };
    g.sum += b.total_price_cents ?? 0;
    g.count += 1;
    groupTotals.set(b.booking_group_id, g);
  }
  return rows.map((b) => {
    const g = b.booking_group_id ? groupTotals.get(b.booking_group_id) : null;
    return {
      ...b,
      bikeName: bikeName(b.bike_id),
      unitLabel: b.bike_unit_id ? unitLabels.get(b.bike_unit_id) ?? null : null,
      pickupAt: toMs(b.date_from, b.pickup_time),
      returnAt: toMs(b.date_to, b.return_time),
      receiptUrl: null, // walk-ins never carry a receipt
      groupTotalCents: g ? g.sum : b.total_price_cents,
      groupSize: g ? g.count : 1,
    };
  });
}

// A walk-in group rendered as one row: customer + the N booking
// rows that make it up. Solo bookings come back as a group of one.
export type BookingDisplay = {
  // ID used in links — for groups, the first member's id (detail
  // page works on any single row in the group).
  primaryId: string;
  // Stable key for React lists. Groups use the group_id, singletons
  // use the booking id.
  key: string;
  bookings: EnrichedBooking[];
  // Convenience accessors that all rows in the group share.
  customerName: string;
  bikeName: string;
  // "[#1, #3]" for a 2-unit group, "[#2]" for a singleton with unit,
  // null for singletons without a unit assigned.
  unitsSummary: string | null;
  pickupAt: number;
  returnAt: number;
  status: BookingRow["status"];
  isGroup: boolean;
};

// Collapse a list of bookings into BookingDisplay entries. Rows
// with the same booking_group_id become one entry; nulls each
// become their own. Order is preserved from the input.
export function groupBookingsForDisplay(rows: EnrichedBooking[]): BookingDisplay[] {
  const byGroup = new Map<string, EnrichedBooking[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = r.booking_group_id ?? `solo-${r.id}`;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(r);
  }
  return order.map((key) => {
    const group = byGroup.get(key)!;
    const head = group[0];
    const unitLabels = group
      .map((b) => b.unitLabel)
      .filter((l): l is string => !!l);
    // For a group, list every distinct model with its count so the
    // dashboard shows ALL reserved bikes at a glance, not just the first.
    const modelCounts = new Map<string, number>();
    for (const b of group) modelCounts.set(b.bikeName, (modelCounts.get(b.bikeName) ?? 0) + 1);
    const bikeNameSummary =
      group.length > 1
        ? [...modelCounts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(", ")
        : head.bikeName;
    return {
      primaryId: head.id,
      key,
      bookings: group,
      customerName: head.customer_name,
      bikeName: bikeNameSummary,
      unitsSummary:
        unitLabels.length > 0 ? `[${unitLabels.join(", ")}]` : null,
      pickupAt: head.pickupAt,
      returnAt: head.returnAt,
      status: head.status,
      isGroup: group.length > 1,
    };
  });
}

export type BookingBuckets = {
  out: EnrichedBooking[];
  pending: EnrichedBooking[];
  // Confirmed bookings whose pickup is today (in Zagreb wall-clock).
  // Owner explicitly asked for these to surface at the top, sorted
  // by pickup time, so the morning starts with a clear list of who
  // arrives when.
  today: EnrichedBooking[];
  // Confirmed bookings currently out whose RETURN is today (Zagreb).
  // Mirror of `today` for the back-half of the day's ops.
  todayReturns: EnrichedBooking[];
  upcoming: EnrichedBooking[];
  past: EnrichedBooking[];
};

// Returns the UTC ms timestamp for 23:59:59 of "today" interpreted
// in the Zagreb timezone. Pickups with pickupAt <= this value AND
// >= start of Zagreb today belong to the today bucket.
function zagrebDayBounds(nowMs: number): { startMs: number; endMs: number } {
  const parts = tzFormatter
    .formatToParts(new Date(nowMs))
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {} as Record<string, string>);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    startMs: toMs(dateStr, "00:00:00"),
    endMs: toMs(dateStr, "23:59:59"),
  };
}

// Sort confirmed bookings into "currently in customer's hands",
// "starts in the future", or "already returned". Pending stays its
// own bucket regardless of dates so the owner sees them first.
// Auto-fallback window: if the owner forgets to click "picked up" /
// "returned", we assume it happened 24h after the scheduled time so the
// dashboard doesn't pile up stale rows forever. Manual clicks
// (picked_up_at / returned_at) always take precedence.
const AUTO_FALLBACK_MS = 24 * 60 * 60_000;

export function bucketBookings(bookings: EnrichedBooking[], nowMs: number): BookingBuckets {
  const out: EnrichedBooking[] = [];
  const pending: EnrichedBooking[] = [];
  const today: EnrichedBooking[] = [];
  const todayReturns: EnrichedBooking[] = [];
  const upcoming: EnrichedBooking[] = [];
  const past: EnrichedBooking[] = [];
  const { endMs: endOfTodayMs } = zagrebDayBounds(nowMs);

  for (const b of bookings) {
    if (b.status === "pending") {
      pending.push(b);
      continue;
    }
    if (b.status === "confirmed") {
      // Fulfillment state: a manual click always wins; otherwise the
      // 24h auto-fallback assumes it happened so rows don't pile up.
      const isReturned =
        b.returned_at != null || nowMs > b.returnAt + AUTO_FALLBACK_MS;
      const isPickedUp =
        b.picked_up_at != null ||
        isReturned ||
        nowMs > b.pickupAt + AUTO_FALLBACK_MS;

      if (isReturned) {
        past.push(b);
      } else if (isPickedUp) {
        // Collected and still out. Due back today → today's returns,
        // otherwise it's a multi-day rental still running.
        if (b.returnAt <= endOfTodayMs) todayReturns.push(b);
        else out.push(b);
      } else if (b.pickupAt > nowMs) {
        // Not collected yet, pickup still ahead. Today's Zagreb day →
        // "Today's pickups"; otherwise a normal future booking.
        if (b.pickupAt <= endOfTodayMs) today.push(b);
        else upcoming.push(b);
      } else {
        // Pickup time passed but not yet marked collected — keep it in
        // "Today's pickups" as overdue (sorts to the top) until the
        // owner confirms or the 24h fallback flips it to picked-up.
        today.push(b);
      }
      continue;
    }
    past.push(b);
  }

  pending.sort((a, b) => a.pickupAt - b.pickupAt);
  out.sort((a, b) => a.returnAt - b.returnAt);
  today.sort((a, b) => a.pickupAt - b.pickupAt);
  todayReturns.sort((a, b) => a.returnAt - b.returnAt);
  upcoming.sort((a, b) => a.pickupAt - b.pickupAt);
  past.sort((a, b) => b.returnAt - a.returnAt);

  return { out, pending, today, todayReturns, upcoming, past };
}

// ---- Business analytics ---------------------------------------------------

export type ModelStats = {
  bikeId: string;
  bikeName: string;
  bookings: number; // how often this model was rented in the range
  rentalDays: number; // total billed days across those bookings
  revenueCents: number; // sum of booking totals (null prices count as 0)
  peakMonth: string | null; // "YYYY-MM" the model was rented most
  peakMonthLabel: string | null; // e.g. "Jul 2026"
  peakMonthCount: number; // rentals in that peak month
};

export type MonthStats = {
  month: string; // "YYYY-MM"
  label: string; // "Jun 2026"
  bookings: number;
  revenueCents: number;
  topBikeName: string | null; // most-rented model that month
  topBikeCount: number;
};

export type BusinessAnalytics = {
  from: string;
  to: string;
  totalBookings: number;
  totalRevenueCents: number;
  totalRentalDays: number;
  models: ModelStats[]; // sorted by revenue desc
  months: MonthStats[]; // chronological — "when was business busiest"
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

// Aggregate confirmed bookings whose pickup date falls inside [from, to]
// (inclusive) into per-model counts, rental-day sums and revenue. Powers
// the owner's business dashboard: which model earns, how often it's out,
// for how long — over any chosen period.
export async function getBusinessAnalytics(
  from: string,
  to: string,
): Promise<BusinessAnalytics> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("bike_id, date_from, date_to, total_price_cents, status")
    .eq("status", "confirmed")
    .gte("date_from", from)
    .lte("date_from", to);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<
    Pick<BookingRow, "bike_id" | "date_from" | "date_to" | "total_price_cents">
  >;

  const byModel = new Map<string, ModelStats>();
  // model → (month → count), to find each model's busiest month.
  const modelMonth = new Map<string, Map<string, number>>();
  // month → aggregate stats across all models.
  const monthAgg = new Map<
    string,
    { bookings: number; revenueCents: number; byBike: Map<string, number> }
  >();
  let totalRevenueCents = 0;
  let totalRentalDays = 0;

  for (const r of rows) {
    const start = new Date(`${r.date_from}T00:00:00`).getTime();
    const end = new Date(`${r.date_to}T00:00:00`).getTime();
    const days = Math.max(1, Math.round((end - start) / 86_400_000) || 1);
    const cents = r.total_price_cents ?? 0;
    const monthKey = r.date_from.slice(0, 7); // YYYY-MM

    let m = byModel.get(r.bike_id);
    if (!m) {
      m = {
        bikeId: r.bike_id,
        bikeName: bikeName(r.bike_id),
        bookings: 0,
        rentalDays: 0,
        revenueCents: 0,
        peakMonth: null,
        peakMonthLabel: null,
        peakMonthCount: 0,
      };
      byModel.set(r.bike_id, m);
    }
    m.bookings += 1;
    m.rentalDays += days;
    m.revenueCents += cents;
    totalRevenueCents += cents;
    totalRentalDays += days;

    // per-model month counts
    let mm = modelMonth.get(r.bike_id);
    if (!mm) {
      mm = new Map();
      modelMonth.set(r.bike_id, mm);
    }
    mm.set(monthKey, (mm.get(monthKey) ?? 0) + 1);

    // overall month aggregate
    let ma = monthAgg.get(monthKey);
    if (!ma) {
      ma = { bookings: 0, revenueCents: 0, byBike: new Map() };
      monthAgg.set(monthKey, ma);
    }
    ma.bookings += 1;
    ma.revenueCents += cents;
    ma.byBike.set(m.bikeName, (ma.byBike.get(m.bikeName) ?? 0) + 1);
  }

  // Resolve each model's peak month.
  for (const [bikeId, mm] of modelMonth) {
    const stat = byModel.get(bikeId);
    if (!stat) continue;
    let bestKey: string | null = null;
    let bestCount = 0;
    for (const [k, c] of mm) {
      if (c > bestCount) {
        bestCount = c;
        bestKey = k;
      }
    }
    stat.peakMonth = bestKey;
    stat.peakMonthLabel = bestKey ? monthLabel(bestKey) : null;
    stat.peakMonthCount = bestCount;
  }

  const months: MonthStats[] = [...monthAgg.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, agg]) => {
      let topBikeName: string | null = null;
      let topBikeCount = 0;
      for (const [name, c] of agg.byBike) {
        if (c > topBikeCount) {
          topBikeCount = c;
          topBikeName = name;
        }
      }
      return {
        month,
        label: monthLabel(month),
        bookings: agg.bookings,
        revenueCents: agg.revenueCents,
        topBikeName,
        topBikeCount,
      };
    });

  const models = [...byModel.values()].sort(
    (a, b) => b.revenueCents - a.revenueCents,
  );

  return {
    from,
    to,
    totalBookings: rows.length,
    totalRevenueCents,
    totalRentalDays,
    models,
    months,
  };
}
