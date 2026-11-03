import { LAST_PICKUP_MINUTES } from "@/lib/pricing";

// Rental season: every year from 1 April (first pickup) to 31 October (last
// return), Thomas 2026-10-26. The site takes bookings all year round, but
// only for days inside a season and never across the winter break. Outside
// the season the owner can still create manual bookings from the admin panel.
export const SEASON_START_MD = "04-01";
export const SEASON_END_MD = "10-31";

// The season running on `iso`, or the next one when `iso` falls in the
// winter break.
export function seasonFor(iso: string): { startIso: string; endIso: string } {
  const year = Number(iso.slice(0, 4)) + (iso.slice(5) > SEASON_END_MD ? 1 : 0);
  return { startIso: `${year}-${SEASON_START_MD}`, endIso: `${year}-${SEASON_END_MD}` };
}

// The FIRST season the public site can be booked for right now: the running
// one, or during the winter break the coming one (openSeasons() adds next
// year's during a season). Once the last pickup slot of the season's final day (31.10, 18:30) has
// started, nothing of this season is bookable any more, so the next one
// opens right away instead of leaving the calendars empty until midnight.
// ">=" on purpose: the calendars and blockedPickupDates count the 18:30 slot
// as gone from 18:30:00.
export function bookableSeason(): { startIso: string; endIso: string } {
  const now = zagrebNow();
  const running = seasonFor(now.isoDate);
  if (now.isoDate === running.endIso && now.minutesOfDay >= LAST_PICKUP_MINUTES) {
    const year = Number(running.endIso.slice(0, 4)) + 1;
    return { startIso: `${year}-${SEASON_START_MD}`, endIso: `${year}-${SEASON_END_MD}` };
  }
  return running;
}

// Every season the public site takes bookings for right now. In the winter
// break only the coming one; during a season the running one AND the next,
// so customers can already book next year (Kristian, 2026-11-02).
export function openSeasons(): Array<{ startIso: string; endIso: string }> {
  const first = bookableSeason();
  if (zagrebNow().isoDate < first.startIso) return [first];
  return [first, seasonFor(addDaysIso(first.endIso, 1))];
}

// True when the entire booking window (from..to inclusive) lies inside ONE
// open season. Used by the public booking endpoints to reject anything that
// touches a closed day: Oct 30 to Apr 2 has both ends "in season" but spans
// the winter, and a season after the open ones is not bookable yet.
export function isBookingInSeason(from: string, to: string): boolean {
  return from <= to && openSeasons().some((s) => from >= s.startIso && to <= s.endIso);
}

// Local-midnight Date for an ISO day, for the calendar components.
export function isoToLocalDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

// Bounds for the public booking calendars (DayPicker): the first bookable
// day (Zadar's today, or the season start in the winter break), the last one
// (end of the last open season) and the closed winter break between two open
// seasons. Same rule as isBookingInSeason.
export function calendarBounds(): {
  first: Date;
  last: Date;
  closed: Array<{ from: Date; to: Date }>;
} {
  const seasons = openSeasons();
  const todayIso = zagrebNow().isoDate;
  const firstIso = todayIso > seasons[0].startIso ? todayIso : seasons[0].startIso;
  const closed = seasons.slice(1).map((s, i) => ({
    from: isoToLocalDate(addDaysIso(seasons[i].endIso, 1)),
    to: isoToLocalDate(addDaysIso(s.startIso, -1)),
  }));
  return {
    first: isoToLocalDate(firstIso),
    last: isoToLocalDate(seasons[seasons.length - 1].endIso),
    closed,
  };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Current wallclock in the shop's timezone (Zagreb). All booking dates
// and times are stored as Zagreb wall time, so any "is this in the past"
// comparison must be made against Zagreb now, not the server's UTC clock.
const ZAGREB_NOW_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zagreb",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function zagrebNow(): { isoDate: string; minutesOfDay: number } {
  const p = ZAGREB_NOW_FMT.formatToParts(new Date()).reduce(
    (acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    },
    {} as Record<string, string>,
  );
  const hour = Number(p.hour === "24" ? "0" : p.hour);
  return { isoDate: `${p.year}-${p.month}-${p.day}`, minutesOfDay: hour * 60 + Number(p.minute) };
}

// True when a pickup (date + "HH:MM", Zagreb wall time) is already in the
// past. The single authoritative guard so no booking route can accept a
// pickup that has already come and gone, whatever the client sent.
export function isPickupInPast(dateFrom: string, pickupTime: string): boolean {
  const now = zagrebNow();
  if (dateFrom < now.isoDate) return true;
  if (dateFrom > now.isoDate) return false;
  const [h, m] = pickupTime.split(":").map(Number);
  return h * 60 + m < now.minutesOfDay;
}
