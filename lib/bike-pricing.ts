import { CATEGORIES, type Category } from "@/lib/mockData";
import { getServiceClient } from "@/lib/supabase";
import {
  SHOP_CLOSE_HOUR,
  SHOP_OPEN_HOUR,
  SLOT_MINUTES,
  TURNAROUND_MINUTES,
} from "@/lib/pricing";
import { SEASON_END_ISO } from "@/lib/season";

// Owner-editable price overrides live in the bike_price_overrides
// table. Day rate has always been editable; weekend / week / month
// rates landed in the 2026-05-18 migration. Anything still NULL in
// the DB falls back to the mockData tier value at read time, so the
// admin only has to touch the rates that actually changed.

type OverrideRow = {
  bike_id: string;
  day_price: string | null;
  weekend_price: string | null;
  week_price: string | null;
  month_price: string | null;
};

type OverrideMap = Map<string, Partial<Record<TierKey, string>>>;

type TierKey = "day" | "weekend" | "week" | "month";

async function loadOverrides(): Promise<OverrideMap> {
  let supabase: ReturnType<typeof getServiceClient>;
  try {
    supabase = getServiceClient();
  } catch (err) {
    // No DB client (missing env at build / transient outage): fall back to
    // catalogue pricing so ISR prerender + revalidation never hard-fail.
    console.error("[bike-pricing] loadOverrides (client)", err);
    return new Map();
  }
  const { data, error } = await supabase
    .from("bike_price_overrides")
    .select("bike_id, day_price, weekend_price, week_price, month_price");
  if (error) {
    // Don't take the whole site down for a pricing read - fall back to
    // mockData and log so it surfaces in Vercel logs.
    console.error("[bike-pricing] loadOverrides", error);
    return new Map();
  }
  const out: OverrideMap = new Map();
  for (const r of (data ?? []) as OverrideRow[]) {
    const tiers: Partial<Record<TierKey, string>> = {};
    if (r.day_price) tiers.day = r.day_price;
    if (r.weekend_price) tiers.weekend = r.weekend_price;
    if (r.week_price) tiers.week = r.week_price;
    if (r.month_price) tiers.month = r.month_price;
    out.set(r.bike_id, tiers);
  }
  return out;
}

function applyOverride(
  cat: Category,
  tiers: Partial<Record<TierKey, string>> | undefined,
): Category {
  if (!tiers) return cat;
  const dayPrice = tiers.day ?? cat.pricing.day;
  return {
    ...cat,
    // Headline price + the /day on the card both follow the day tier.
    price: dayPrice,
    pricing: {
      day: dayPrice,
      weekend: tiers.weekend ?? cat.pricing.weekend,
      week: tiers.week ?? cat.pricing.week,
      month: tiers.month ?? cat.pricing.month,
    },
  };
}

// Full CATEGORIES list with overrides merged. Use this on any page
// that renders pricing (home, info, fleet detail).
export async function getCategoriesWithPricing(): Promise<Category[]> {
  const overrides = await loadOverrides();
  return CATEGORIES.map((cat) => applyOverride(cat, overrides.get(cat.id)));
}

// Single bike lookup with override applied. Returns null when the id
// is unknown.
export async function getBikeWithPricing(bikeId: string): Promise<Category | null> {
  const cat = CATEGORIES.find((c) => c.id === bikeId);
  if (!cat) return null;
  const overrides = await loadOverrides();
  return applyOverride(cat, overrides.get(bikeId));
}

// Used by the admin pricing page to show current values (override if
// set, otherwise the mockData default). One row per bike per tier so
// the manager UI can render a clean grid.
export type PricingRow = {
  bikeId: string;
  bikeName: string;
  dayPrice: number;
  weekendPrice: number;
  weekPrice: number;
  monthPrice: number;
  hasOverride: Record<TierKey, boolean>;
};

function parseEuro(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function listPricingRows(): Promise<PricingRow[]> {
  const overrides = await loadOverrides();
  return CATEGORIES.map((cat) => {
    const tiers = overrides.get(cat.id) ?? {};
    return {
      bikeId: cat.id,
      bikeName: cat.shortName ?? cat.model,
      dayPrice: parseEuro(tiers.day ?? cat.pricing.day),
      weekendPrice: parseEuro(tiers.weekend ?? cat.pricing.weekend),
      weekPrice: parseEuro(tiers.week ?? cat.pricing.week),
      monthPrice: parseEuro(tiers.month ?? cat.pricing.month),
      hasOverride: {
        day: !!tiers.day,
        weekend: !!tiers.weekend,
        week: !!tiers.week,
        month: !!tiers.month,
      },
    };
  });
}

// Map of bike-id -> number of active physical units. Used on the
// public fleet cards / detail pages so customers see "we have 4 of
// these" and know group bookings are possible. Falls back to an
// empty map if the read fails so the page never breaks over this.
//
// Backup units (is_backup = true) are excluded from this count —
// they exist in the booking pool but stay invisible to customers,
// the owner decides spontaneously whether to release the spare.
export async function getUnitCounts(): Promise<Record<string, number>> {
  let supabase: ReturnType<typeof getServiceClient>;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error("[bike-pricing] getUnitCounts (client)", err);
    return {};
  }
  const { data, error } = await supabase
    .from("bike_units")
    .select("bike_id")
    .eq("active", true)
    .eq("is_backup", false);
  if (error) {
    console.error("[bike-pricing] getUnitCounts", error);
    return {};
  }
  const out: Record<string, number> = {};
  for (const u of (data ?? []) as Array<{ bike_id: string }>) {
    out[u.bike_id] = (out[u.bike_id] ?? 0) + 1;
  }
  return out;
}

// Zagreb-wallclock → UTC ms helper, scoped to this module so we
// don't pull a hard dep on admin-data.ts. Used by the availability-
// now calculation below.
const ZAGREB_TZ = "Europe/Zagreb";
const ZAGREB_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: ZAGREB_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});
function zagrebWallToMs(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  const parts = ZAGREB_FMT.formatToParts(new Date(asUtc)).reduce(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>,
  );
  const zagrebInterpretation = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute), Number(parts.second),
  );
  return asUtc - (zagrebInterpretation - asUtc);
}

function todayInZagreb(nowMs: number): string {
  const parts = ZAGREB_FMT.formatToParts(new Date(nowMs)).reduce(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>,
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Slice a UTC ms timestamp into its Zagreb-wallclock parts so we can
// snap candidate pickup moments to shop hours / next opening.
function zagrebTimeParts(ms: number): {
  isoDate: string;
  hour: number;
  minute: number;
} {
  const parts = ZAGREB_FMT.formatToParts(new Date(ms)).reduce(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {} as Record<string, string>,
  );
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

// Per-bike availability snapshot for *right now*. Used on the public
// homepage fleet cards so visitors get an instant green/red signal
// instead of having to open the calendar. A unit counts as "available
// now" if it's active AND not in a confirmed booking that covers
// this moment AND not under a service block that covers this moment.
// Whole-model service blocks lock every unit of that bike at once.
//
// When every unit is busy, we also surface availableFromMs — the
// earliest UTC ms timestamp at which any unit becomes free again.
// The card uses it to render "Booked out until 11:30" instead of a
// dead-end "All rented out" that makes visitors bounce.
export async function getAvailableNowCounts(): Promise<
  Record<
    string,
    {
      total: number;
      available: number;
      cause: "service" | "rented" | null;
      availableFromMs: number | null;
    }
  >
> {
  let supabase: ReturnType<typeof getServiceClient>;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error("[bike-pricing] getAvailableNowCounts (client)", err);
    return {};
  }
  const nowMs = Date.now();
  const today = todayInZagreb(nowMs);

  const [unitsRes, bookingsRes, blocksRes] = await Promise.all([
    supabase
      .from("bike_units")
      .select("id, bike_id")
      .eq("active", true)
      // Backup / reserve units are off-the-books for public counts —
      // they exist physically but Thomas hands them out at his
      // discretion. Including them here made the card lie when the
      // whole fleet was actually out (4 of 5 50cc rented, badge still
      // said "Available now" because the reserve was technically idle).
      .eq("is_backup", false),
    supabase
      .from("bookings")
      .select("bike_unit_id, date_from, date_to, pickup_time, return_time")
      .in("status", ["confirmed", "pending"])
      // Pull every booking from today onwards, not just the ones
      // currently covering today. The unitFreeAt chain walks forward
      // through back-to-back bookings to find the next real opening
      // — if we only loaded today-overlapping rows it would jump over
      // tomorrow's reservations and the pill would lie ("Ausgebucht
      // bis 29.05" while the calendar still shows 29 + 30 red).
      .gte("date_to", today)
      // A returned bike frees its unit immediately, even if the
      // scheduled return time is still ahead — don't count it as out.
      .is("returned_at", null),
    supabase
      .from("blocked_dates")
      .select("bike_id, bike_unit_id, date_from, date_to, start_time, end_time")
      .is("booking_id", null)
      .lte("date_from", today)
      .gte("date_to", today),
  ]);

  if (unitsRes.error) {
    console.error("[bike-pricing] availability units", unitsRes.error);
    return {};
  }

  type B = {
    bike_unit_id: string | null;
    date_from: string;
    date_to: string;
    pickup_time: string;
    return_time: string;
  };
  type M = {
    bike_id: string;
    bike_unit_id: string | null;
    date_from: string;
    date_to: string;
    start_time: string | null;
    end_time: string | null;
  };

  // Bucket every confirmed booking by its unit so we can both flag
  // currently-rented units AND look ahead to compute when a busy unit
  // next becomes free (chained through back-to-back bookings).
  const turnaroundMs = TURNAROUND_MINUTES * 60_000;
  const unitBookings = new Map<string, Array<{ start: number; end: number }>>();
  const rentedUnitIds = new Set<string>();
  for (const b of ((bookingsRes.data ?? []) as B[])) {
    if (!b.bike_unit_id) continue;
    const start = zagrebWallToMs(b.date_from, b.pickup_time);
    const end = zagrebWallToMs(b.date_to, b.return_time);
    let arr = unitBookings.get(b.bike_unit_id);
    if (!arr) {
      arr = [];
      unitBookings.set(b.bike_unit_id, arr);
    }
    arr.push({ start, end });
    // Currently inside the rental window? (A booking that only starts
    // later leaves the unit free now — the booking engine has no minimum
    // gap rule, so the pill agrees: available until the rental starts.)
    if (nowMs >= start && nowMs < end) {
      rentedUnitIds.add(b.bike_unit_id);
      continue;
    }
  }

  // Pickup is only useful if it falls inside shop hours AND leaves a
  // 30-min slot before close. Anything past 18:30 Zagreb bumps to the
  // next day 09:00, then we re-check booking conflicts on that day.
  // Returns null when no slot before SEASON_END_ISO can fit.
  const lastPickupMin = (SHOP_CLOSE_HOUR - 1) * 60 + (60 - SLOT_MINUTES);
  const openLabel = `${String(SHOP_OPEN_HOUR).padStart(2, "0")}:00`;
  const seasonCutoffMs = zagrebWallToMs(SEASON_END_ISO, "23:59");
  function nextPickupableMoment(
    sortedBookings: Array<{ start: number; end: number }>,
    startFromMs: number,
  ): number | null {
    let candidate = startFromMs;
    for (let guard = 0; guard < 400; guard++) {
      if (candidate > seasonCutoffMs) return null;
      const parts = zagrebTimeParts(candidate);
      const minOfDay = parts.hour * 60 + parts.minute;
      if (minOfDay < SHOP_OPEN_HOUR * 60) {
        candidate = zagrebWallToMs(parts.isoDate, openLabel);
        continue;
      }
      if (minOfDay > lastPickupMin) {
        // Push to next calendar day at 09:00 Zagreb
        const nextDay = zagrebTimeParts(candidate + 86_400_000);
        candidate = zagrebWallToMs(nextDay.isoDate, openLabel);
        continue;
      }
      // Inside business hours — does any booking block this candidate
      // (taking turnaround into account)?
      const conflict = sortedBookings.find(
        (iv) => candidate >= iv.start - turnaroundMs && candidate < iv.end + turnaroundMs,
      );
      if (conflict) {
        candidate = conflict.end + turnaroundMs;
        continue;
      }
      // Not in a conflict — the booking engine will offer this slot (it
      // has no minimum-gap rule), so the pill returns it as the free-from
      // moment.
      return candidate;
    }
    return null;
  }

  function unitFreeAt(unitId: string): number | null {
    const arr = unitBookings.get(unitId);
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a.start - b.start);
    const current = sorted.find((iv) => nowMs >= iv.start && nowMs < iv.end);
    if (current) {
      return nextPickupableMoment(sorted, current.end + turnaroundMs);
    }
    // Not inside any rental window → the unit is free right now.
    return null;
  }

  const serviceUnitIds = new Set<string>();
  const modelInService = new Set<string>();
  for (const m of ((blocksRes.data ?? []) as M[])) {
    let coversNow = true;
    if (m.start_time && m.end_time) {
      const start = zagrebWallToMs(m.date_from, m.start_time);
      const end = zagrebWallToMs(m.date_to, m.end_time);
      coversNow = nowMs >= start && nowMs < end;
    }
    if (!coversNow) continue;
    if (m.bike_unit_id) serviceUnitIds.add(m.bike_unit_id);
    else modelInService.add(m.bike_id);
  }

  const counts: Record<
    string,
    {
      total: number;
      available: number;
      rented: number;
      service: number;
      // Earliest moment any rented unit on this bike becomes free
      // again. Used only when no unit is available right now — the
      // card surfaces it as "Booked out until 11:30".
      earliestFreeMs: number | null;
    }
  > = {};
  for (const u of ((unitsRes.data ?? []) as Array<{ id: string; bike_id: string }>)) {
    if (!counts[u.bike_id]) {
      counts[u.bike_id] = { total: 0, available: 0, rented: 0, service: 0, earliestFreeMs: null };
    }
    const c = counts[u.bike_id];
    c.total += 1;
    if (modelInService.has(u.bike_id)) {
      c.service += 1;
      continue;
    }
    if (serviceUnitIds.has(u.id)) {
      c.service += 1;
      continue;
    }
    if (rentedUnitIds.has(u.id)) {
      c.rented += 1;
      const freeAt = unitFreeAt(u.id);
      if (freeAt !== null) {
        c.earliestFreeMs = c.earliestFreeMs === null ? freeAt : Math.min(c.earliestFreeMs, freeAt);
      }
      continue;
    }
    c.available += 1;
  }

  // Reduce to the public shape: cause is "service" only when every
  // unavailable unit is in service (no actual rental conflict),
  // otherwise "rented" so the visitor knows it's a customer thing not
  // a maintenance thing.
  const out: Record<
    string,
    { total: number; available: number; cause: "service" | "rented" | null; availableFromMs: number | null }
  > = {};
  for (const [bikeId, c] of Object.entries(counts)) {
    const cause: "service" | "rented" | null =
      c.available === c.total
        ? null
        : c.rented === 0 && c.service > 0
          ? "service"
          : "rented";
    // Only surface a "from" timestamp when the bike is completely out;
    // having one unit free already means the green pill wins.
    const availableFromMs = c.available === 0 && cause === "rented" ? c.earliestFreeMs : null;
    out[bikeId] = { total: c.total, available: c.available, cause, availableFromMs };
  }
  return out;
}

// Upsert any subset of tier overrides for a bike. Values are bare
// euro integers; we serialise them as "<n>€" to match the existing
// db format. Pass null in a slot to mean "no override here" — that
// slot is written back as null so it reverts to the mockData default.
export async function setPriceOverrides(
  bikeId: string,
  prices: { day?: number | null; weekend?: number | null; week?: number | null; month?: number | null },
): Promise<void> {
  const supabase = getServiceClient();
  const row: Record<string, string | null> = {
    bike_id: bikeId,
    updated_at: new Date().toISOString(),
  };
  function set(col: string, v: number | null | undefined) {
    if (v === undefined) return;
    if (v === null) {
      row[col] = null;
      return;
    }
    if (!Number.isInteger(v) || v <= 0 || v > 99999) {
      throw new Error(`${col} must be 1-99999`);
    }
    row[col] = `${v}€`;
  }
  set("day_price", prices.day);
  set("weekend_price", prices.weekend);
  set("week_price", prices.week);
  set("month_price", prices.month);

  const { error } = await supabase
    .from("bike_price_overrides")
    .upsert(row, { onConflict: "bike_id" });
  if (error) throw new Error(error.message);
}
