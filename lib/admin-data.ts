import { CATEGORIES } from "@/lib/mockData";
import {
  getServiceClient,
  type BookingRow,
  type BlockedDateRow,
  type BikeUnitRow,
} from "@/lib/supabase";
import { signedReceiptUrl } from "@/lib/storage";

export type EnrichedBooking = BookingRow & {
  bikeName: string;
  unitLabel: string | null;
  pickupAt: number; // ms
  returnAt: number;
  receiptUrl: string | null;
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
  // Distinct unit IDs of currently-out (confirmed + within window) bookings.
  outUnits: number;
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
  const urls = await Promise.all(
    rows.map((b) =>
      b.deposit_screenshot_path
        ? signedReceiptUrl(b.deposit_screenshot_path).catch(() => null)
        : Promise.resolve<string | null>(null),
    ),
  );

  return rows.map((b, i) => ({
    ...b,
    bikeName: bikeName(b.bike_id),
    unitLabel: b.bike_unit_id ? unitLabels.get(b.bike_unit_id) ?? null : null,
    pickupAt: toMs(b.date_from, b.pickup_time),
    returnAt: toMs(b.date_to, b.return_time),
    receiptUrl: urls[i],
  }));
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
  const [url, unitLabels] = await Promise.all([
    data.deposit_screenshot_path
      ? signedReceiptUrl(data.deposit_screenshot_path).catch(() => null)
      : Promise.resolve<string | null>(null),
    listUnitLabelMap(),
  ]);
  return {
    ...data,
    bikeName: bikeName(data.bike_id),
    unitLabel: data.bike_unit_id ? unitLabels.get(data.bike_unit_id) ?? null : null,
    pickupAt: toMs(data.date_from, data.pickup_time),
    returnAt: toMs(data.date_to, data.return_time),
    receiptUrl: url,
  };
}

// Per-bike rollup for the admin Fleet section: total physical units,
// how many are currently out, plus pending/upcoming counts. "Out"
// covers both customer bookings and active per-unit service blocks
// so the owner sees a single accurate count.
export async function listFleetSummary(nowMs: number): Promise<FleetEntry[]> {
  const supabase = getServiceClient();
  const [unitsRes, bookingsRes, blocksRes] = await Promise.all([
    supabase.from("bike_units").select("id, bike_id").eq("active", true),
    supabase
      .from("bookings")
      .select("bike_id, bike_unit_id, status, date_from, date_to, pickup_time, return_time"),
    supabase
      .from("blocked_dates")
      .select("bike_id, bike_unit_id, date_from, date_to, start_time, end_time")
      .is("booking_id", null),
  ]);
  if (unitsRes.error) throw new Error(unitsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);

  const unitsByBike = new Map<string, number>();
  for (const u of (unitsRes.data ?? []) as Array<{ id: string; bike_id: string }>) {
    unitsByBike.set(u.bike_id, (unitsByBike.get(u.bike_id) ?? 0) + 1);
  }

  const out = new Map<string, { outUnits: Set<string>; pending: number; upcoming: number }>();
  for (const b of (bookingsRes.data ?? []) as Array<{
    bike_id: string;
    bike_unit_id: string | null;
    status: string;
    date_from: string;
    date_to: string;
    pickup_time: string;
    return_time: string;
  }>) {
    const entry =
      out.get(b.bike_id) ??
      (() => {
        const e = { outUnits: new Set<string>(), pending: 0, upcoming: 0 };
        out.set(b.bike_id, e);
        return e;
      })();
    if (b.status === "pending") entry.pending++;
    if (b.status === "confirmed") {
      const start = toMs(b.date_from, b.pickup_time);
      const end = toMs(b.date_to, b.return_time);
      if (start <= nowMs && end >= nowMs) {
        if (b.bike_unit_id) entry.outUnits.add(b.bike_unit_id);
      } else if (start > nowMs) {
        entry.upcoming++;
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
        const entry =
          out.get(m.bike_id) ??
          (() => {
            const e = { outUnits: new Set<string>(), pending: 0, upcoming: 0 };
            out.set(m.bike_id, e);
            return e;
          })();
        entry.upcoming++;
      }
      continue;
    }
    const entry =
      out.get(m.bike_id) ??
      (() => {
        const e = { outUnits: new Set<string>(), pending: 0, upcoming: 0 };
        out.set(m.bike_id, e);
        return e;
      })();
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
    return {
      bikeId: cat.id,
      bikeName: cat.shortName ?? cat.model,
      totalUnits: unitsByBike.get(cat.id) ?? 0,
      outUnits: entry?.outUnits.size ?? 0,
      pendingCount: entry?.pending ?? 0,
      upcomingCount: entry?.upcoming ?? 0,
    };
  });
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
  return rows.map((b) => ({
    ...b,
    bikeName: bikeName(b.bike_id),
    unitLabel: b.bike_unit_id ? unitLabels.get(b.bike_unit_id) ?? null : null,
    pickupAt: toMs(b.date_from, b.pickup_time),
    returnAt: toMs(b.date_to, b.return_time),
    receiptUrl: null, // walk-ins never carry a receipt
  }));
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
    return {
      primaryId: head.id,
      key,
      bookings: group,
      customerName: head.customer_name,
      bikeName: head.bikeName,
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
};

export type BusinessAnalytics = {
  from: string;
  to: string;
  totalBookings: number;
  totalRevenueCents: number;
  totalRentalDays: number;
  models: ModelStats[]; // sorted by revenue desc
};

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
  let totalRevenueCents = 0;
  let totalRentalDays = 0;

  for (const r of rows) {
    const start = new Date(`${r.date_from}T00:00:00`).getTime();
    const end = new Date(`${r.date_to}T00:00:00`).getTime();
    const days = Math.max(1, Math.round((end - start) / 86_400_000) || 1);
    const cents = r.total_price_cents ?? 0;

    let m = byModel.get(r.bike_id);
    if (!m) {
      m = {
        bikeId: r.bike_id,
        bikeName: bikeName(r.bike_id),
        bookings: 0,
        rentalDays: 0,
        revenueCents: 0,
      };
      byModel.set(r.bike_id, m);
    }
    m.bookings += 1;
    m.rentalDays += days;
    m.revenueCents += cents;
    totalRevenueCents += cents;
    totalRentalDays += days;
  }

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
  };
}
