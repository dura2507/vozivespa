import { notFound } from "next/navigation";
import { getBikeWithPricing, getUnitCounts, getCategoriesWithPricing } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import BikeDetail from "./BikeDetail";

// ISR: cache the bike page, refresh stock + booked-dates every 2 min.
// Live availability is re-checked at booking submit, so brief staleness is
// safe. Was force-dynamic (SSR + DB on every request).
export const revalidate = 120;

// Prerender one cached page per bike (IDs come from the static catalogue,
// so this needs no DB). Next crosses these with the parent [lang] params.
// Without this the route stays fully dynamic and never caches.
export async function generateStaticParams() {
  const cats = await getCategoriesWithPricing();
  return cats.map((cat) => ({ bikeId: cat.id }));
}

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
    />
  );
}
