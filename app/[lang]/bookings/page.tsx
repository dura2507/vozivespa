import { redirect, notFound } from "next/navigation";
import { CATEGORIES } from "@/lib/mockData";
import { isLocale } from "@/lib/i18n/config";

type SearchParams = Promise<{ bike?: string }>;

export default async function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: SearchParams;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const { bike } = await searchParams;
  if (bike && CATEGORIES.some((c) => c.id === bike)) {
    redirect(`/${lang}/fleet/${bike}`);
  }
  redirect(`/${lang}/#fleet`);
}
