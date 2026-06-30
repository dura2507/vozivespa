// Short, human-readable booking number derived deterministically from the
// booking id (or the group id for a multi-booking, so every bike in a
// group shares ONE number). No DB column needed: the same id always maps
// to the same code. Customers quote this number plus their phone when they
// pay, so the owner can match an incoming payment to the right booking.
export function bookingRef(idOrGroupId: string): string {
  const slug = idOrGroupId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  return `RM-${slug}`;
}
