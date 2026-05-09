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

function toMs(date: string, time: string | null | undefined): number {
  const t = time ? (time.length === 5 ? `${time}:00` : time) : "00:00:00";
  return new Date(`${date}T${t}`).getTime();
}

function bikeName(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.model ?? id;
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
// how many are currently out, plus pending/upcoming counts.
export async function listFleetSummary(nowMs: number): Promise<FleetEntry[]> {
  const supabase = getServiceClient();
  const [unitsRes, bookingsRes] = await Promise.all([
    supabase.from("bike_units").select("id, bike_id").eq("active", true),
    supabase
      .from("bookings")
      .select("bike_id, bike_unit_id, status, date_from, date_to, pickup_time, return_time"),
  ]);
  if (unitsRes.error) throw new Error(unitsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

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

  return CATEGORIES.map<FleetEntry>((cat) => {
    const entry = out.get(cat.id);
    return {
      bikeId: cat.id,
      bikeName: cat.model,
      totalUnits: unitsByBike.get(cat.id) ?? 0,
      outUnits: entry?.outUnits.size ?? 0,
      pendingCount: entry?.pending ?? 0,
      upcomingCount: entry?.upcoming ?? 0,
    };
  });
}

export async function listManualBlocks(): Promise<EnrichedBlock[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("*")
    .is("booking_id", null)
    .order("date_from", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => ({
    ...(b as BlockedDateRow),
    bikeName: bikeName((b as BlockedDateRow).bike_id),
  }));
}

export type BookingBuckets = {
  out: EnrichedBooking[];
  pending: EnrichedBooking[];
  upcoming: EnrichedBooking[];
  past: EnrichedBooking[];
};

// Sort confirmed bookings into "currently in customer's hands",
// "starts in the future", or "already returned". Pending stays its
// own bucket regardless of dates so the owner sees them first.
export function bucketBookings(bookings: EnrichedBooking[], nowMs: number): BookingBuckets {
  const out: EnrichedBooking[] = [];
  const pending: EnrichedBooking[] = [];
  const upcoming: EnrichedBooking[] = [];
  const past: EnrichedBooking[] = [];

  for (const b of bookings) {
    if (b.status === "pending") {
      pending.push(b);
      continue;
    }
    if (b.status === "confirmed") {
      if (b.pickupAt <= nowMs && b.returnAt >= nowMs) out.push(b);
      else if (b.pickupAt > nowMs) upcoming.push(b);
      else past.push(b);
      continue;
    }
    past.push(b);
  }

  pending.sort((a, b) => a.pickupAt - b.pickupAt);
  out.sort((a, b) => a.returnAt - b.returnAt);
  upcoming.sort((a, b) => a.pickupAt - b.pickupAt);
  past.sort((a, b) => b.returnAt - a.returnAt);

  return { out, pending, upcoming, past };
}
