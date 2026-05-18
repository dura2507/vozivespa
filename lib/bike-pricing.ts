import { CATEGORIES, type Category } from "@/lib/mockData";
import { getServiceClient } from "@/lib/supabase";

// Owner-editable price overrides live in the bike_price_overrides
// table. Day rate has always been editable; weekend / week / month
// rates landed in the 2026-05-18 migration. Anything still NULL in
// the DB falls back to the mockData tier value at read time, so the
// admin only has to touch the rates that actually changed.

type OverrideRow = {
  bike_id: string;
  day_price: string | null;
  weekend_price: string | null;
  week_price: string | null;
  month_price: string | null;
};

type OverrideMap = Map<string, Partial<Record<TierKey, string>>>;

type TierKey = "day" | "weekend" | "week" | "month";

async function loadOverrides(): Promise<OverrideMap> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bike_price_overrides")
    .select("bike_id, day_price, weekend_price, week_price, month_price");
  if (error) {
    // Don't take the whole site down for a pricing read - fall back to
    // mockData and log so it surfaces in Vercel logs.
    console.error("[bike-pricing] loadOverrides", error);
    return new Map();
  }
  const out: OverrideMap = new Map();
  for (const r of (data ?? []) as OverrideRow[]) {
    const tiers: Partial<Record<TierKey, string>> = {};
    if (r.day_price) tiers.day = r.day_price;
    if (r.weekend_price) tiers.weekend = r.weekend_price;
    if (r.week_price) tiers.week = r.week_price;
    if (r.month_price) tiers.month = r.month_price;
    out.set(r.bike_id, tiers);
  }
  return out;
}

function applyOverride(
  cat: Category,
  tiers: Partial<Record<TierKey, string>> | undefined,
): Category {
  if (!tiers) return cat;
  const dayPrice = tiers.day ?? cat.pricing.day;
  return {
    ...cat,
    // Headline price + the /day on the card both follow the day tier.
    price: dayPrice,
    pricing: {
      day: dayPrice,
      weekend: tiers.weekend ?? cat.pricing.weekend,
      week: tiers.week ?? cat.pricing.week,
      month: tiers.month ?? cat.pricing.month,
    },
  };
}

// Full CATEGORIES list with overrides merged. Use this on any page
// that renders pricing (home, info, fleet detail).
export async function getCategoriesWithPricing(): Promise<Category[]> {
  const overrides = await loadOverrides();
  return CATEGORIES.map((cat) => applyOverride(cat, overrides.get(cat.id)));
}

// Single bike lookup with override applied. Returns null when the id
// is unknown.
export async function getBikeWithPricing(bikeId: string): Promise<Category | null> {
  const cat = CATEGORIES.find((c) => c.id === bikeId);
  if (!cat) return null;
  const overrides = await loadOverrides();
  return applyOverride(cat, overrides.get(bikeId));
}

// Used by the admin pricing page to show current values (override if
// set, otherwise the mockData default). One row per bike per tier so
// the manager UI can render a clean grid.
export type PricingRow = {
  bikeId: string;
  bikeName: string;
  dayPrice: number;
  weekendPrice: number;
  weekPrice: number;
  monthPrice: number;
  hasOverride: Record<TierKey, boolean>;
};

function parseEuro(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function listPricingRows(): Promise<PricingRow[]> {
  const overrides = await loadOverrides();
  return CATEGORIES.map((cat) => {
    const tiers = overrides.get(cat.id) ?? {};
    return {
      bikeId: cat.id,
      bikeName: cat.shortName ?? cat.model,
      dayPrice: parseEuro(tiers.day ?? cat.pricing.day),
      weekendPrice: parseEuro(tiers.weekend ?? cat.pricing.weekend),
      weekPrice: parseEuro(tiers.week ?? cat.pricing.week),
      monthPrice: parseEuro(tiers.month ?? cat.pricing.month),
      hasOverride: {
        day: !!tiers.day,
        weekend: !!tiers.weekend,
        week: !!tiers.week,
        month: !!tiers.month,
      },
    };
  });
}

// Map of bike-id -> number of active physical units. Used on the
// public fleet cards / detail pages so customers see "we have 4 of
// these" and know group bookings are possible. Falls back to an
// empty map if the read fails so the page never breaks over this.
export async function getUnitCounts(): Promise<Record<string, number>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bike_units")
    .select("bike_id")
    .eq("active", true);
  if (error) {
    console.error("[bike-pricing] getUnitCounts", error);
    return {};
  }
  const out: Record<string, number> = {};
  for (const u of (data ?? []) as Array<{ bike_id: string }>) {
    out[u.bike_id] = (out[u.bike_id] ?? 0) + 1;
  }
  return out;
}

// Upsert any subset of tier overrides for a bike. Values are bare
// euro integers; we serialise them as "<n>€" to match the existing
// db format. Pass null in a slot to mean "no override here" — that
// slot is written back as null so it reverts to the mockData default.
export async function setPriceOverrides(
  bikeId: string,
  prices: { day?: number | null; weekend?: number | null; week?: number | null; month?: number | null },
): Promise<void> {
  const supabase = getServiceClient();
  const row: Record<string, string | null> = {
    bike_id: bikeId,
    updated_at: new Date().toISOString(),
  };
  function set(col: string, v: number | null | undefined) {
    if (v === undefined) return;
    if (v === null) {
      row[col] = null;
      return;
    }
    if (!Number.isInteger(v) || v <= 0 || v > 99999) {
      throw new Error(`${col} must be 1-99999`);
    }
    row[col] = `${v}€`;
  }
  set("day_price", prices.day);
  set("weekend_price", prices.weekend);
  set("week_price", prices.week);
  set("month_price", prices.month);

  const { error } = await supabase
    .from("bike_price_overrides")
    .upsert(row, { onConflict: "bike_id" });
  if (error) throw new Error(error.message);
}
