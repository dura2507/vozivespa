import { CATEGORIES, type Category } from "@/lib/mockData";
import { getServiceClient } from "@/lib/supabase";

// Owner-editable day-price overrides live in the bike_price_overrides
// table. Everything else (weekend/week/month tiers, copy, images, …)
// stays in mockData. Reads merge the override onto the mock at request
// time so a price change is visible on the next page load.

type OverrideRow = { bike_id: string; day_price: string };

async function loadOverrides(): Promise<Map<string, string>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bike_price_overrides")
    .select("bike_id, day_price");
  if (error) {
    // Don't take the whole site down for a pricing read — fall back to
    // mockData and log so it surfaces in Vercel logs.
    console.error("[bike-pricing] loadOverrides", error);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const r of (data ?? []) as OverrideRow[]) out.set(r.bike_id, r.day_price);
  return out;
}

function applyOverride(cat: Category, dayPrice: string | undefined): Category {
  if (!dayPrice) return cat;
  return {
    ...cat,
    price: dayPrice,
    pricing: { ...cat.pricing, day: dayPrice },
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
// set, otherwise the mockData default).
export type PricingRow = {
  bikeId: string;
  bikeName: string;
  // Numeric day price (no € suffix), ready for an <input type="number">.
  // Falls back to the mockData value when no override exists.
  dayPrice: number;
  // True when the row currently has a DB override (vs. the mockData default).
  hasOverride: boolean;
};

function parseEuro(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function listPricingRows(): Promise<PricingRow[]> {
  const overrides = await loadOverrides();
  return CATEGORIES.map((cat) => {
    const override = overrides.get(cat.id);
    return {
      bikeId: cat.id,
      bikeName: cat.model,
      dayPrice: parseEuro(override ?? cat.pricing.day),
      hasOverride: !!override,
    };
  });
}

export async function setDayPriceOverride(bikeId: string, dayEuros: number): Promise<void> {
  if (!Number.isInteger(dayEuros) || dayEuros <= 0) {
    throw new Error("Day price must be a positive integer");
  }
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("bike_price_overrides")
    .upsert(
      { bike_id: bikeId, day_price: `${dayEuros}€`, updated_at: new Date().toISOString() },
      { onConflict: "bike_id" },
    );
  if (error) throw new Error(error.message);
}
