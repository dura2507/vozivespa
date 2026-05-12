import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ----- Types matching the DB schema -----

export type BikeRow = {
  id: string;
  active: boolean;
  created_at: string;
};

export type BikeUnitRow = {
  id: string;
  bike_id: string;
  label: string;
  active: boolean;
  created_at: string;
};

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";

export type BookingRow = {
  id: string;
  bike_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string | null;
  date_from: string; // ISO date YYYY-MM-DD
  date_to: string;
  pickup_time: string; // HH:MM:SS (Postgres time)
  return_time: string;
  total_price_cents: number | null;
  payment_method: "paypal_ff" | "paypal_company" | "bank" | null;
  // Path inside the `booking-receipts` Storage bucket. Owner sees a
  // signed URL in Telegram + email, never exposed to the public.
  deposit_screenshot_path: string | null;
  // Which physical unit (row in bike_units) was assigned. Set at insert
  // time; may be reassigned at confirm-time if the original unit isn't
  // free anymore.
  bike_unit_id: string | null;
  // Set on each row when the owner records a walk-in group booking
  // (e.g. "Max rents both Duke 390s") so the dashboard can collapse
  // N rows into one customer entry. Null on solo + website bookings.
  booking_group_id: string | null;
  drivers_licence: "A" | "A1" | "A2" | "AM" | "B" | null;
  riding_style: "solo" | "with_passenger" | null;
  // UI locale the customer used when submitting. Drives the language
  // of the receipt / confirmed / declined emails.
  locale: "en" | "de" | "es" | "it" | "hr";
  status: BookingStatus;
  secret_token: string;
  created_at: string;
  decided_at: string | null;
};

export type BlockedDateRow = {
  id: string;
  bike_id: string;
  // Null = block the whole model. Set = block only this physical unit
  // (e.g. one of four Liberty 50s is in for service). Manual blocks
  // from the admin UI always carry a unit id; legacy rows may not.
  bike_unit_id: string | null;
  date_from: string;
  date_to: string;
  // Optional time window (HH:MM:SS). Both null = whole day; both set =
  // time-bounded service block (e.g. 09:00-12:00 for a quick repair).
  start_time: string | null;
  end_time: string | null;
  // Null → manual block by owner. Set → auto-block from confirmed booking.
  booking_id: string | null;
  // Free-text owner note for service / repair / private use.
  reason: string | null;
  created_at: string;
};

// ----- Clients -----

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser / server client using the public anon key.
 * Subject to RLS - currently nothing is exposed.
 */
export function getPublicClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}

/**
 * Server-only client using the service_role key - bypasses RLS.
 * Never import this from a Client Component or expose it to the browser.
 */
export function getServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
