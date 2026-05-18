import { listPricingRows } from "@/lib/bike-pricing";
import { PricingManager } from "./pricing-manager";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const rows = await listPricingRows();
  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
      <h1 className="font-bold text-3xl text-ink mb-2">
        Pricing
      </h1>
      <p className="text-sm text-muted mb-8 max-w-prose">
        Edit any tier and click Save. The new price goes live on the next page
        load (home, info, fleet detail, booking flow). Day = single-day rate;
        Weekend = Fri-Sun flat; Week = 7-day flat; Month = 30-day flat.
      </p>
      <PricingManager initial={rows} />
    </div>
  );
}
