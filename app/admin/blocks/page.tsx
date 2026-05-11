import { CATEGORIES } from "@/lib/mockData";
import { listManualBlocks } from "@/lib/admin-data";
import { BlocksManager } from "./blocks-manager";

export const dynamic = "force-dynamic";

export default async function AdminBlocksPage() {
  const blocks = await listManualBlocks();
  const bikes = CATEGORIES.map((c) => ({ id: c.id, name: c.shortName ?? c.model }));
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8">
      <h1 className="font-barlow font-black uppercase text-3xl tracking-tight text-ink mb-2">
        Manual blocks
      </h1>
      <p className="text-sm text-muted mb-8 max-w-prose">
        Block dates yourself when a bike is in service or you&apos;re using it
        privately. Manual blocks always cover the whole day; for time-aware
        availability use a booking instead.
      </p>
      <BlocksManager initialBlocks={blocks} bikes={bikes} />
    </div>
  );
}
