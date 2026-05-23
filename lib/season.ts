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
