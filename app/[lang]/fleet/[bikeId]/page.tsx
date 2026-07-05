import { notFound } from "next/navigation";
import { getBikeWithPricing, getUnitCounts } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { onlinePaymentEnabled } from "@/lib/payments";
import BikeDetail from "./BikeDetail";

// Render on every request so a deployed fix / price / stock change is live
// immediately. ISR (revalidate=120) was a Hobby-plan CPU workaround, but a
// low-traffic bike/lang URL only revalidates on the NEXT request after the
// window and serves the STALE HTML shell meanwhile — which pinned an OLD JS
// bundle and kept a fixed bug (empty same-day pickup) live for ~2h after the
// fix deployed. On Pro there's no hard CPU cap, and the live availability data
// is already client-fetched from force-dynamic /api/availability, so this only
// stops caching the shell. Live availability is still re-checked at submit.
export const dynamic = "force-dynamic";

export default async function BikeDetailPage({
  params,
}: {
  params: Promise<{ lang: string; bikeId: string }>;
}) {
  const { lang, bikeId } = await params;
  if (!isLocale(lang)) notFound();
  const [bike, dict, unitCounts] = await Promise.all([
    getBikeWithPricing(bikeId),
    getDictionary(lang as Locale),
    getUnitCounts(),
  ]);
  if (!bike) notFound();
  const unitCount = unitCounts[bike.id] ?? 0;
  return (
    <BikeDetail
      lang={lang as Locale}
      dict={dict}
      bike={bike}
      unitCount={unitCount}
      onlinePayment={onlinePaymentEnabled()}
    />
  );
}
