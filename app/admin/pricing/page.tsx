import { listPricingRows } from "@/lib/bike-pricing";
import { PricingManager } from "./pricing-manager";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const rows = await listPricingRows();
  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
      <h1 className="font-barlow font-black uppercase text-3xl tracking-tight text-ink mb-2">
        Pricing
      </h1>
      <p className="text-sm text-muted mb-8 max-w-prose">
        Day rates for short rentals. Edit a number, click Save, and the new
        price goes live on the next page load (home, info, fleet detail).
        Weekend, week and month rates are not editable here.
      </p>
      <PricingManager initial={rows} />
    </div>
  );
}
