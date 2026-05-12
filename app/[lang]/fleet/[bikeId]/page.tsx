import { notFound } from "next/navigation";
import { getBikeWithPricing, getUnitCounts } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import BikeDetail from "./BikeDetail";

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
    />
  );
}
