import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/mockData";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";

export const metadata = {
  title: "Terms & Conditions · SickMotos",
  description: "Reservation terms for SickMotos scooter and motorbike rentals in Zadar.",
};

export default async function TermsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang as Locale);
  const SECTIONS = dict.terms.sections;
  return (
    <>
      <Navbar lang={lang as Locale} t={dict.nav} />
      <main className="pt-32 pb-24 md:pb-16 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-3">
            {dict.terms.eyebrow}
          </p>
          <h1 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.9] tracking-tight text-ink mb-4">
            {dict.terms.title}
          </h1>
          <p className="text-muted text-base leading-relaxed mb-12">
            {dict.terms.intro.replace("{legal}", BRAND.legal)}
          </p>

          <div className="space-y-12">
            {SECTIONS.map((section) => (
              <section key={section.heading}>
                <h2 className="font-barlow font-bold uppercase text-2xl tracking-tight text-ink mb-4">
                  {section.heading}
                </h2>
                <ul className="space-y-3">
                  {section.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-ink text-sm leading-relaxed"
                    >
                      <span className="text-red font-bold mt-0.5 shrink-0">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-16 pt-8 border-t border-ink/10 text-xs text-muted">
            <p>
              {BRAND.legal} · OIB {BRAND.oib} · {BRAND.address}
            </p>
            <p className="mt-1">
              {dict.terms.questionsLine}{" "}
              <a href={`mailto:${BRAND.email}`} className="text-red font-semibold">
                {BRAND.email}
              </a>{" "}
              {dict.terms.questionsTail}
            </p>
          </div>
        </div>
      </main>
      <Footer lang={lang as Locale} t={dict.footer} nav={dict.nav} />
    </>
  );
}
