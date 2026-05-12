import { CATEGORIES } from "@/lib/mockData";
import { listManualBlocks } from "@/lib/admin-data";
import { getServiceClient } from "@/lib/supabase";
import { BlocksManager } from "./blocks-manager";

export const dynamic = "force-dynamic";

type BikeUnitRow = { id: string; bike_id: string; label: string };

async function listAllUnits(): Promise<BikeUnitRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bike_units")
    .select("id, bike_id, label")
    .eq("active", true)
    .order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BikeUnitRow[];
}

export default async function AdminBlocksPage() {
  const [blocks, units] = await Promise.all([listManualBlocks(), listAllUnits()]);
  const bikes = CATEGORIES.map((c) => ({ id: c.id, name: c.shortName ?? c.model }));
  // Pre-group units by bike so the client doesn't have to filter on
  // every render. Friendlier label "#1, #2, …" derived per bike from
  // the sort order; the DB id stays the source of truth.
  const unitsByBike: Record<string, Array<{ id: string; label: string }>> = {};
  for (const u of units) {
    const arr = (unitsByBike[u.bike_id] ??= []);
    arr.push({ id: u.id, label: `#${arr.length + 1}` });
  }
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8">
      <h1 className="font-barlow font-black uppercase text-3xl tracking-tight text-ink mb-2">
        Blocks & walk-ins
      </h1>
      <p className="text-sm text-muted mb-8 max-w-prose">
        Block a single unit when it&apos;s in for service / repair, or
        record a walk-in booking that didn&apos;t come through the
        website. Pick the specific unit (e.g. Liberty 50 #2) so the
        other units of the same model stay bookable. With a customer
        name the entry becomes a confirmed booking and appears in the
        dashboard; without one it&apos;s a service block.
      </p>
      <BlocksManager initialBlocks={blocks} bikes={bikes} unitsByBike={unitsByBike} />
    </div>
  );
}
