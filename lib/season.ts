// Rental season window. Bookings outside this range are blocked on the
// public site — out-of-season visitors see a contact-only state. Owner
// can still create manual bookings from the admin panel if a one-off
// extension is needed.
//
// Update these two lines per year. Format: YYYY-MM-DD (local, no TZ).
export const SEASON_START_ISO = "2026-04-01";
export const SEASON_END_ISO = "2026-10-25";

export const SEASON_START_DATE = new Date(`${SEASON_START_ISO}T00:00:00`);
export const SEASON_END_DATE = new Date(`${SEASON_END_ISO}T00:00:00`);

// True when an ISO date string (YYYY-MM-DD) sits inside the season,
// inclusive on both ends.
export function isIsoInSeason(iso: string): boolean {
  return iso >= SEASON_START_ISO && iso <= SEASON_END_ISO;
}

// True when the entire booking window (from..to inclusive) is inside
// the season. Used by the public booking endpoint to reject anything
// that touches a closed day.
export function isBookingInSeason(from: string, to: string): boolean {
  return isIsoInSeason(from) && isIsoInSeason(to);
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
