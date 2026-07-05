import { notFound } from "next/navigation";
import { getCategoriesWithPricing, getUnitCounts } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { onlinePaymentEnabled } from "@/lib/payments";
import GroupBooking from "./GroupBooking";

// Render on every request. Live per-date availability is already fetched
// client-side from force-dynamic /api/availability/fleet, so the only thing
// ISR bought here was a cached HTML shell — which could pin an old JS bundle
// after a deploy and hide a shipped multibook fix. ISR (revalidate=120) was a
// Hobby-plan CPU workaround; unnecessary on Pro. Kept in lockstep with home +
// fleet so a fix never lands everywhere except here.
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
      onlinePayment={onlinePaymentEnabled()}
    />
  );
}
