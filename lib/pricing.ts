import type { PricingTiers } from "@/lib/mockData";

export const SHOP_OPEN_HOUR = 9;
export const SHOP_CLOSE_HOUR = 19;
export const SLOT_MINUTES = 30;
const GRACE_MINUTES = 15;

// Owner needs this much time between two bookings on the same bike to
// receive the returning bike, check it, refuel and prep for the next
// renter. Applied as a buffer in the time-aware overlap check.
export const TURNAROUND_MINUTES = 60;

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

// Set of ISO dates that are fully blocked: every active unit has at
// least one booking covering that date. Used to disable dates in the
// calendar so customers can't pick a window that has zero chance.
export function fullyBookedDates(
  bookings: ConfirmedBooking[],
  totalUnits: number,
): string[] {
  if (totalUnits <= 0) return [];
  const occupancy = new Map<string, Set<string>>();
  for (const b of bookings) {
    if (!b.unitId) continue;
    let cursor = new Date(`${b.from}T00:00:00`);
    const end = new Date(`${b.to}T00:00:00`);
    while (cursor.getTime() <= end.getTime()) {
      const iso = toIsoDate(cursor);
      let set = occupancy.get(iso);
      if (!set) {
        set = new Set();
        occupancy.set(iso, set);
      }
      set.add(b.unitId);
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
  }
  const out: string[] = [];
  for (const [iso, units] of occupancy) {
    if (units.size >= totalUnits) out.push(iso);
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
// Weekend tier (and weekend-mix) is only eligible when pickup is on Friday.
// Pure weekend = Fri pickup + Sun return (any 09-19 time both ends), flat.
// Weekend-mix = Fri pickup + return after Sunday: weekend_price + (calendar
// days past Sunday) * day_price.
//
// Time of day is honoured for the day/week/month tiers via `billableDays`,
// so a Fri 09:00 → Sat 18:00 trip counts as 2 day-units.
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

  if (p.weekend && isFriPickup) {
    // Sunday of the pickup week (pickup Fri + 2 days). We compare
    // against this so a Fri → SAME-week Sun is the only pure-weekend
    // booking; a Fri → later-week Sun falls into weekend-mix and
    // gets billed per extra calendar day past the pickup Sunday.
    // Without this cap a 10-day booking that happens to start on a
    // Friday and end on a Sunday would be priced as a flat weekend.
    const sundayOfPickupWeek = new Date(fromDate);
    sundayOfPickupWeek.setDate(sundayOfPickupWeek.getDate() + 2);
    const isSameWeekendReturn =
      isSunReturn && calendarDaysBetween(sundayOfPickupWeek, toDate) === 0;
    if (isSameWeekendReturn) {
      candidates.push({ price: p.weekend, tier: "weekend" });
    } else {
      const extraDays = calendarDaysBetween(sundayOfPickupWeek, toDate);
      if (extraDays > 0) {
        candidates.push({
          price: p.weekend + extraDays * p.day,
          tier: "weekend-mix",
        });
      }
    }
  }

  if (p.week && days >= 7) {
    const weeks = Math.floor(days / 7);
    const rem = days - weeks * 7;
    candidates.push({
      price: weeks * p.week + rem * p.day,
      // Pure multiples (2 weeks, 3 weeks, …) get the plain "week"
      // label since there is no day-tier remainder being added —
      // "Wochen-Tarif × 2" is friendlier than "Wochen-Mix".
      tier: rem === 0 ? "week" : "week-mix",
    });
  }

  if (p.month && days >= 30) {
    const months = Math.floor(days / 30);
    const rem = days - months * 30;
    candidates.push({
      price: months * p.month + rem * p.day,
      tier: rem === 0 ? "month" : "month-mix",
    });
  }

  const best = candidates.reduce((a, b) => (b.price < a.price ? b : a));
  return { totalPrice: best.price, appliedTier: best.tier, billableDays: days };
}
