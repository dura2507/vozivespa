import { notFound } from "next/navigation";
import { getCategoriesWithPricing, getUnitCounts } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import GroupBooking from "./GroupBooking";

export const dynamic = "force-dynamic";

// Multi-bike ("group") booking page: pick a shared date window, then add
// several different bikes from the whole fleet to one booking. Stage 2b.
export default async function GroupBookingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [bikes, dict, unitCounts] = await Promise.all([
    getCategoriesWithPricing(),
    getDictionary(lang as Locale),
    getUnitCounts(),
  ]);
  return (
    <GroupBooking
      lang={lang as Locale}
      dict={dict}
      bikes={bikes}
      unitCounts={unitCounts}
    />
  );
}
