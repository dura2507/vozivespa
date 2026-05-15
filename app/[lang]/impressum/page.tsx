import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ImprintContent, LEGAL_STRINGS } from "@/lib/legal-content";

export default async function ImprintPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale = lang as Locale;
  const dict = await getDictionary(locale);
  const strings = LEGAL_STRINGS[locale];

  return (
    <>
      <Navbar lang={locale} t={dict.nav} />
      <main className="bg-off-white">
        <div className="max-w-3xl mx-auto px-5 md:px-8 pt-32 pb-16">
          <Link
            href={`/${locale}`}
            className="text-xs font-bold tracking-[0.15em] uppercase text-muted hover:text-red transition-colors"
          >
            {strings.backHome}
          </Link>
          <h1 className="font-bold text-3xl sm:text-4xl text-ink mt-3 mb-8">
            {strings.imprintTitle}
          </h1>
          <ImprintContent locale={locale} />
        </div>
      </main>
      <Footer lang={locale} t={dict.footer} nav={dict.nav} />
    </>
  );
}
