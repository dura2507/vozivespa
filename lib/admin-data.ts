import { CATEGORIES } from "@/lib/mockData";
import { getServiceClient, type BookingRow, type BlockedDateRow } from "@/lib/supabase";
import { signedReceiptUrl } from "@/lib/storage";

export type EnrichedBooking = BookingRow & {
  bikeName: string;
  pickupAt: number; // ms
  returnAt: number;
  receiptUrl: string | null;
};

export type EnrichedBlock = BlockedDateRow & {
  bikeName: string;
};

function toMs(date: string, time: string | null | undefined): number {
  const t = time ? (time.length === 5 ? `${time}:00` : time) : "00:00:00";
  return new Date(`${date}T${t}`).getTime();
}

function bikeName(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.model ?? id;
}

// Pull every booking with derived fields used across the admin pages.
// Receipt URLs are signed in parallel so a list of 30 bookings doesn't
// turn into 30 sequential round-trips.
export async function listAllBookings(): Promise<EnrichedBooking[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("date_from", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as BookingRow[];
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
  const url = data.deposit_screenshot_path
    ? await signedReceiptUrl(data.deposit_screenshot_path).catch(() => null)
    : null;
  return {
    ...data,
    bikeName: bikeName(data.bike_id),
    pickupAt: toMs(data.date_from, data.pickup_time),
    returnAt: toMs(data.date_to, data.return_time),
    receiptUrl: url,
  };
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
