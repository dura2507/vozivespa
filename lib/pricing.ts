import type { PricingTiers } from "@/lib/mockData";

export const SHOP_OPEN_HOUR = 9;
export const SHOP_CLOSE_HOUR = 19;
export const SLOT_MINUTES = 30;
const GRACE_MINUTES = 15;

// Owner needs this much time between two bookings on the same bike to
// receive the returning bike, check it, refuel and prep for the next
// renter. Applied as a buffer in the time-aware overlap check.
export const TURNAROUND_MINUTES = 30;

export type AppliedTier =
  | "day"
  | "weekend"
  | "weekend-mix"
  | "week"
  | "week-mix"
  | "month"
  | "month-mix";

export type PriceResult = {
  totalPrice: number;
  appliedTier: AppliedTier;
  billableDays: number;
};

export const TIER_LABEL: Record<AppliedTier, string> = {
  day: "Daily rate",
  weekend: "Weekend rate (Fri-Sun)",
  "weekend-mix": "Weekend + day mix",
  week: "Week rate",
  "week-mix": "Week + day mix",
  month: "Month rate",
  "month-mix": "Month + day mix",
};

// "HH:MM" → total minutes since midnight. Returns null on bad input.
export function parseTime(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function isValidSlot(t: string): boolean {
  const mins = parseTime(t);
  if (mins === null) return false;
  if (mins < SHOP_OPEN_HOUR * 60 || mins > SHOP_CLOSE_HOUR * 60) return false;
  return mins % SLOT_MINUTES === 0;
}

// All half-hour pickup/return slots from 09:00 to 19:00 inclusive.
export function buildSlots(): string[] {
  const out: string[] = [];
  for (let h = SHOP_OPEN_HOUR; h <= SHOP_CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      if (h === SHOP_CLOSE_HOUR && m > 0) break;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

// Confirmed booking on a bike, used to compute time-slot constraints.
// `unitId` identifies which physical bike unit holds this booking; null
// for legacy bookings created before the multi-unit migration.
export type ConfirmedBooking = {
  from: string; // YYYY-MM-DD
  to: string;
  pickupTime: string; // HH:MM
  returnTime: string;
  unitId: string | null;
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Number of physical units busy at a given moment. A unit is "busy" if
// any of its bookings overlaps the moment within the 1h turnaround
// buffer (so we can't reuse it yet).
function countBusyUnitsAt(
  date: Date,
  time: string,
  bookings: ConfirmedBooking[],
): number {
  const slotMs = combineDateTime(date, time).getTime();
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const occupied = new Set<string>();
  for (const b of bookings) {
    if (!b.unitId) continue;
    const bStart = combineDateTime(new Date(`${b.from}T00:00:00`), b.pickupTime).getTime();
    const bEnd = combineDateTime(new Date(`${b.to}T00:00:00`), b.returnTime).getTime();
    if (bStart - bufferMs <= slotMs && slotMs < bEnd + bufferMs) {
      occupied.add(b.unitId);
    }
  }
  return occupied.size;
}

// Slots a customer may pick as their pickup time on `pickupDate`. A
// slot is bookable as long as at least one physical unit of the bike
// model is free at that moment (with the turnaround buffer applied).
// Multi-unit bikes therefore stay bookable even when one or two of
// their units are mid-rental.
export function validPickupSlots(
  pickupDate: Date,
  bookings: ConfirmedBooking[],
  totalUnits: number,
): string[] {
  if (totalUnits <= 0) return buildSlots();
  return buildSlots().filter(
    (s) => countBusyUnitsAt(pickupDate, s, bookings) < totalUnits,
  );
}

// Same logic as validPickupSlots . at any candidate time T on the
// return date, we need at least one unit to be free so the customer
// can drop off without colliding with another booking that starts on
// that unit within the turnaround window.
export function validReturnSlots(
  returnDate: Date,
  bookings: ConfirmedBooking[],
  totalUnits: number,
): string[] {
  if (totalUnits <= 0) return buildSlots();
  return buildSlots().filter(
    (s) => countBusyUnitsAt(returnDate, s, bookings) < totalUnits,
  );
}

// Set of ISO dates that are fully blocked: for every active unit, its
// bookings (with turnaround buffer applied) jointly cover shop-open
// through shop-close. A single mid-day return is no longer a blocker;
// only when back-to-back rentals on the same unit also seal the day.
export function fullyBookedDates(
  bookings: ConfirmedBooking[],
  totalUnits: number,
): string[] {
  if (totalUnits <= 0) return [];
  const openLabel = `${String(SHOP_OPEN_HOUR).padStart(2, "0")}:00`;
  const closeLabel = `${String(SHOP_CLOSE_HOUR).padStart(2, "0")}:00`;
  const bufferMs = TURNAROUND_MINUTES * 60_000;

  // Bucket bookings per unit, and collect every ISO date any booking
  // touches so we only check the days that could plausibly be full.
  const perUnit = new Map<string, ConfirmedBooking[]>();
  const candidateDates = new Set<string>();
  for (const b of bookings) {
    if (!b.unitId) continue;
    let arr = perUnit.get(b.unitId);
    if (!arr) {
      arr = [];
      perUnit.set(b.unitId, arr);
    }
    arr.push(b);
    let cursor = new Date(`${b.from}T00:00:00`);
    const last = new Date(`${b.to}T00:00:00`);
    while (cursor.getTime() <= last.getTime()) {
      candidateDates.add(toIsoDate(cursor));
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
  }

  function unitCoversDay(unitBookings: ConfirmedBooking[], day: Date): boolean {
    const dayOpen = combineDateTime(day, openLabel).getTime();
    const dayClose = combineDateTime(day, closeLabel).getTime();
    // Project each booking onto the shop-hours window of this day,
    // applying the turnaround buffer on both sides.
    const intervals: [number, number][] = [];
    for (const b of unitBookings) {
      const bStart = combineDateTime(new Date(`${b.from}T00:00:00`), b.pickupTime).getTime() - bufferMs;
      const bEnd = combineDateTime(new Date(`${b.to}T00:00:00`), b.returnTime).getTime() + bufferMs;
      const start = Math.max(bStart, dayOpen);
      const end = Math.min(bEnd, dayClose);
      if (start < end) intervals.push([start, end]);
    }
    if (intervals.length === 0) return false;
    intervals.sort((a, b) => a[0] - b[0]);
    let covered = dayOpen;
    for (const [s, e] of intervals) {
      if (s > covered) return false; // gap inside shop hours
      if (e > covered) covered = e;
      if (covered >= dayClose) return true;
    }
    return covered >= dayClose;
  }

  const out: string[] = [];
  for (const iso of candidateDates) {
    const day = new Date(`${iso}T00:00:00`);
    let unitsCovering = 0;
    for (const unitBookings of perUnit.values()) {
      if (unitCoversDay(unitBookings, day)) unitsCovering++;
    }
    if (unitsCovering >= totalUnits) out.push(iso);
  }
  return out;
}

function combineDateTime(date: Date, time: string): Date {
  const mins = parseTime(time) ?? 0;
  const d = new Date(date);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function calendarDaysBetween(a: Date, b: Date): number {
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bMid - aMid) / 86_400_000);
}

// Convert pickup/return to billable 24h units. 15-minute grace, min 1.
export function billableDays(
  fromDate: Date,
  toDate: Date,
  pickupTime: string,
  returnTime: string,
): number {
  const pickup = combineDateTime(fromDate, pickupTime).getTime();
  const ret = combineDateTime(toDate, returnTime).getTime();
  const diffMin = (ret - pickup) / 60_000 - GRACE_MINUTES;
  if (diffMin <= 0) return 1;
  return Math.max(1, Math.ceil(diffMin / (24 * 60)));
}

// Returns null if any pricing tier missing / unparseable.
function parsePricing(p: PricingTiers) {
  const day = parseInt(p.day, 10);
  if (!Number.isFinite(day) || day <= 0) return null;
  return {
    day,
    weekend: parseInt(p.weekend, 10) || 0,
    week: parseInt(p.week, 10) || 0,
    month: parseInt(p.month, 10) || 0,
  };
}

// Cheapest applicable tier for the given window.
//
// Owner's pricing rule (Thomas, 2026-05-13): each tier is a tier-rate
// scaled by days. Longer rentals get the lower per-day rate of the
// next tier instead of stacking the old tier with extra day-tier
// add-ons.
//
//   • 1-2 days, or not Fri-pickup → day_rate * days
//   • Fri pickup + Sun return (same week) → weekend_rate flat (2-3d)
//   • Fri pickup + 3-6 days → weekend_rate * days / 3 (pro-rata)
//   • 7+ days → week_rate * days / 7 (pro-rata)
//   • 30+ days → month_rate * days / 30 (pro-rata)
//
// All candidates are added and the cheapest wins, so the customer
// always gets the best applicable rate even on awkward boundaries
// (e.g. a 6-day Fri-pickup beats day-tier with weekend pro-rata; a
// 7-day rental jumps to week-rate which beats day-tier × 7).
export function calculatePrice(
  fromDate: Date,
  toDate: Date,
  pickupTime: string,
  returnTime: string,
  pricing: PricingTiers,
): PriceResult | null {
  const p = parsePricing(pricing);
  if (!p) return null;

  const days = billableDays(fromDate, toDate, pickupTime, returnTime);

  type Candidate = { price: number; tier: AppliedTier };
  const candidates: Candidate[] = [{ price: p.day * days, tier: "day" }];

  const isFriPickup = fromDate.getDay() === 5;
  const isSunReturn = toDate.getDay() === 0;

  // Weekend pricing is only for Friday-pickup rentals. Within that:
  //   - return on Sun of pickup week → flat weekend (the cheaper of
  //     "weekend" and "weekend pro-rata" applies anyway via cheapest-
  //     wins, so adding both is safe).
  //   - any 3-6 day Fri-pickup → weekend pro-rata.
  // After 6 days we drop weekend tier entirely; day 7 lives in the
  // week tier per Thomas's "Siebter Tag = Wochenpreis" rule.
  if (p.weekend && isFriPickup) {
    const sundayOfPickupWeek = new Date(fromDate);
    sundayOfPickupWeek.setDate(sundayOfPickupWeek.getDate() + 2);
    const isSameWeekendReturn =
      isSunReturn && calendarDaysBetween(sundayOfPickupWeek, toDate) === 0;
    if (isSameWeekendReturn) {
      candidates.push({ price: p.weekend, tier: "weekend" });
    }
    if (days >= 3 && days <= 6) {
      candidates.push({
        price: Math.round((p.weekend * days) / 3),
        tier: "weekend-mix",
      });
    }
  }

  // Week tier: 7 days = flat week_rate; 8+ days scale pro-rata from
  // the week price (so 8 days = week × 8/7, 14 days = week × 2, etc).
  // The remainder-as-day-tier model was undercharging compared to the
  // owner's intent — he wants the cheaper week per-day rate to keep
  // applying for the full duration up to the month threshold.
  if (p.week && days >= 7) {
    candidates.push({
      price: Math.round((p.week * days) / 7),
      tier: days === 7 || days % 7 === 0 ? "week" : "week-mix",
    });
  }

  // Same model for month tier — 30+ days scale pro-rata from month_rate.
  if (p.month && days >= 30) {
    candidates.push({
      price: Math.round((p.month * days) / 30),
      tier: days === 30 || days % 30 === 0 ? "month" : "month-mix",
    });
  }

  const best = candidates.reduce((a, b) => (b.price < a.price ? b : a));
  return { totalPrice: best.price, appliedTier: best.tier, billableDays: days };
}
