import type { PricingTiers } from "@/lib/mockData";

export const SHOP_OPEN_HOUR = 9;
export const SHOP_CLOSE_HOUR = 19;
export const SLOT_MINUTES = 30;
// Owner policy (Thomas, 2026-06-25): a rental gets one full hour of
// grace past the 24h mark before the second day is billed. So anything
// up to 25h counts as one day; from 25h onward it's two. Applies to
// website price calc only (walk-ins are typed in by hand).
const GRACE_MINUTES = 60;

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

// All half-hour slots from 09:00 to 19:00 inclusive. This is the RETURN
// slot list — a bike may come back right at closing (19:00).
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

// Latest PICKUP of the day. Owner policy (Thomas, 2026-07-01): the shop
// won't hand a bike out at closing (19:00) — there's no time to fit
// helmets and brief the rider — so the last pickup slot is one earlier.
// Returns still go all the way to 19:00. Keeping this as the single
// source stops the homepage badge and the booking form from disagreeing
// about whether a bike freed at 18:30 is pickupable "today at 19:00".
export const LAST_PICKUP_MINUTES = SHOP_CLOSE_HOUR * 60 - SLOT_MINUTES; // 18:30

// Pickup slots: 09:00 .. 18:30 (never 19:00 — see LAST_PICKUP_MINUTES).
export function buildPickupSlots(): string[] {
  return buildSlots().filter((s) => {
    const mins = parseTime(s);
    return mins !== null && mins <= LAST_PICKUP_MINUTES;
  });
}

// Stricter than isValidSlot: a valid PICKUP time also can't be 19:00.
export function isValidPickupSlot(t: string): boolean {
  const mins = parseTime(t);
  return mins !== null && isValidSlot(t) && mins <= LAST_PICKUP_MINUTES;
}

// Outside-hours add-on (Thomas, 2026-07-06): the shop can hand a bike out
// before opening or take it back after closing for a flat fee. These are
// bookable directly in the pickup/return dropdowns and priced as a flat
// surcharge PER RENTAL, never as an extra billable day (see billableDays,
// which clamps to shop hours). Early = before 09:00, late = after 19:00.
export const OUTSIDE_HOURS_SURCHARGE = 30;
export const EARLY_PICKUP_SLOTS = ["07:00", "07:30", "08:00", "08:30"];
export const LATE_RETURN_SLOTS = ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];

export function isEarlyPickup(t: string): boolean {
  const mins = parseTime(t);
  return mins !== null && mins < SHOP_OPEN_HOUR * 60;
}
export function isLateReturn(t: string): boolean {
  const mins = parseTime(t);
  return mins !== null && mins > SHOP_CLOSE_HOUR * 60;
}
// Flat surcharge in euros for the chosen window (0, 30 or 60).
export function outsideHoursSurcharge(pickupTime: string, returnTime: string): number {
  return (
    (isEarlyPickup(pickupTime) ? OUTSIDE_HOURS_SURCHARGE : 0) +
    (isLateReturn(returnTime) ? OUTSIDE_HOURS_SURCHARGE : 0)
  );
}
// Server-side validation that ALSO accepts the outside-hours slots. Used by
// the booking routes so a legitimately-chosen 08:00 pickup / 21:00 return
// isn't rejected as an invalid slot.
export function isBookablePickupSlot(t: string): boolean {
  return isValidPickupSlot(t) || EARLY_PICKUP_SLOTS.includes(t);
}
export function isBookableReturnSlot(t: string): boolean {
  return isValidSlot(t) || LATE_RETURN_SLOTS.includes(t);
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

// Count of units that are free for the WHOLE window (with turnaround
// buffer on both sides). Mirrors server-side findFreeUnit so the slot
// filters and the submit check never disagree — a slot the picker offers
// is always one findFreeUnit will accept.
function unitsFreeForWindow(
  pickupDate: Date,
  pickupTime: string,
  returnDate: Date,
  returnTime: string,
  bookings: ConfirmedBooking[],
  activeUnitIds: string[] | null,
): number {
  const bufferMs = TURNAROUND_MINUTES * 60_000;
  const winStart = combineDateTime(pickupDate, pickupTime).getTime();
  const winEnd = combineDateTime(returnDate, returnTime).getTime();
  if (winEnd <= winStart) return 0;
  // Capacity model, mirrors findFreeUnit: customers aren't pinned to a bike, so
  // "free units" = K minus the PEAK number of bookings needed at once inside the
  // window (any unit, incl. unassigned), not the count of distinct units touched.
  const ov: Array<{ s: number; e: number }> = [];
  for (const b of bookings) {
    const bStart = combineDateTime(new Date(`${b.from}T00:00:00`), b.pickupTime).getTime();
    const bEnd = combineDateTime(new Date(`${b.to}T00:00:00`), b.returnTime).getTime();
    if (winStart < bEnd + bufferMs && bStart - bufferMs < winEnd) ov.push({ s: bStart, e: bEnd });
  }
  const instants = [winStart];
  for (const b of ov) instants.push(b.s - bufferMs);
  let peak = 0;
  for (const t of instants) {
    if (t < winStart || t >= winEnd) continue;
    let dem = 0;
    for (const b of ov) if (b.s - bufferMs <= t && t < b.e + bufferMs) dem++;
    if (dem > peak) peak = dem;
  }
  if (activeUnitIds && activeUnitIds.length > 0) return activeUnitIds.length - peak;
  // Fallback when unit ids aren't available client-side: negative peak so the
  // caller can do totalUnits + (-peak) > 0.
  return -peak;
}

// Is at least one unit free for an ARBITRARY window? Used to validate the
// outside-hours add-on slots (07:00-08:30 / 19:30-22:00) against their real
// extended window before offering them, so the dropdown never advertises an
// early/late time the server's findFreeUnit would then reject. Mirrors the
// totalUnits<=0 optimism and the free-count logic of validPickupSlots.
export function isWindowFree(
  pickupDate: Date,
  pickupTime: string,
  returnDate: Date,
  returnTime: string,
  bookings: ConfirmedBooking[],
  totalUnits: number,
  activeUnitIds?: string[] | null,
): boolean {
  if (totalUnits <= 0) return true;
  const ids = activeUnitIds ?? null;
  const free = unitsFreeForWindow(pickupDate, pickupTime, returnDate, returnTime, bookings, ids);
  return ids ? free > 0 : totalUnits + free > 0;
}

// Pickup slots that leave a bookable window ending at returnTime (on the
// return date). We check the FULL window against every candidate slot,
// so a pickup that would clash later is dropped up-front — no more
// "green button, then time-conflict error" at submit.
export function validPickupSlots(
  pickupDate: Date,
  bookings: ConfirmedBooking[],
  totalUnits: number,
  ctx?: { returnDate: Date; returnTime: string; activeUnitIds?: string[] },
): string[] {
  // Pickup list never includes 19:00 (closing) — see buildPickupSlots.
  if (totalUnits <= 0) return buildPickupSlots();
  const returnDate = ctx?.returnDate ?? pickupDate;
  const returnTime = ctx?.returnTime ?? "19:00";
  const activeUnitIds = ctx?.activeUnitIds ?? null;
  return buildPickupSlots().filter((s) => {
    const free = unitsFreeForWindow(pickupDate, s, returnDate, returnTime, bookings, activeUnitIds);
    // With ids: raw count of free units. Without: negative count of busy
    // units — we need totalUnits + free > 0 to know at least one is free.
    return activeUnitIds ? free > 0 : totalUnits + free > 0;
  });
}

// Return slots that keep the whole window (from the chosen pickup) free
// on at least one unit. Same rule as findFreeUnit — no lookahead needed
// because the rental ends at the slot.
export function validReturnSlots(
  returnDate: Date,
  bookings: ConfirmedBooking[],
  totalUnits: number,
  ctx?: { pickupDate: Date; pickupTime: string; activeUnitIds?: string[] },
): string[] {
  if (totalUnits <= 0) return buildSlots();
  const pickupDate = ctx?.pickupDate ?? returnDate;
  const pickupTime = ctx?.pickupTime ?? "09:00";
  const activeUnitIds = ctx?.activeUnitIds ?? null;
  return buildSlots().filter((s) => {
    const free = unitsFreeForWindow(pickupDate, pickupTime, returnDate, s, bookings, activeUnitIds);
    return activeUnitIds ? free > 0 : totalUnits + free > 0;
  });
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

// Convert pickup/return to billable 24h units. 1-hour grace, min 1.
export function billableDays(
  fromDate: Date,
  toDate: Date,
  pickupTime: string,
  returnTime: string,
): number {
  // An outside-hours pickup/return carries a flat surcharge, not an extra
  // billable day, so the day count is computed on the shop-hours window: a
  // pickup before 09:00 counts from 09:00, a return after 19:00 counts to
  // 19:00. This is a no-op for every in-hours time (09:00-19:00).
  const openMin = SHOP_OPEN_HOUR * 60;
  const closeMin = SHOP_CLOSE_HOUR * 60;
  const pMin = Math.max(parseTime(pickupTime) ?? openMin, openMin);
  const rMin = Math.min(parseTime(returnTime) ?? closeMin, closeMin);
  const pickup = new Date(fromDate);
  pickup.setHours(Math.floor(pMin / 60), pMin % 60, 0, 0);
  const ret = new Date(toDate);
  ret.setHours(Math.floor(rMin / 60), rMin % 60, 0, 0);
  const diffMin = (ret.getTime() - pickup.getTime()) / 60_000 - GRACE_MINUTES;
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
