import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getCategoriesWithPricing } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

const LicenceIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
  </svg>
);

const PaymentIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const PickupIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);

const InsuranceIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

export default async function InfoPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang as Locale);
  const t = dict.info;
  const CATEGORIES = await getCategoriesWithPricing();
  const REQUIREMENTS = [
    {
      Icon: LicenceIcon,
      title: t.licenceRequirements.title,
      items: [
        t.licenceRequirements.scooter50,
        t.licenceRequirements.scooter125,
        t.licenceRequirements.motorbike390,
        t.licenceRequirements.verify,
      ],
    },
    {
      Icon: PaymentIcon,
      title: t.depositPayment.title,
      items: [
        t.depositPayment.deposit.replace("{deposit}", "250€"),
        t.depositPayment.bookingFee,
        t.depositPayment.noCards,
      ],
    },
  ];
  return (
    <>
      <Navbar lang={lang as Locale} t={dict.nav} />
      <main className="pt-32 pb-24 md:pb-16 px-5 md:px-12 min-h-screen">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
              {t.eyebrow}
            </p>
            <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,7rem)] leading-none tracking-tight text-ink">
              {t.title}
            </h1>
          </div>

          {/* Requirements */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-14">
            {REQUIREMENTS.map((req) => (
              <div key={req.title} className="bg-sand px-6 py-7">
                <span className="text-ink/70"><req.Icon /></span>
                <h2 className="font-barlow font-bold uppercase tracking-tight text-ink text-xl mt-3 mb-4">
                  {req.title}
                </h2>
                <ul className="space-y-2.5">
                  {req.items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-ink/70">
                      <span className="text-red shrink-0 leading-none">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div className="mb-14">
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-ink mb-6">
              {t.fleetSection.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {CATEGORIES.map((cat) => (
                <div key={cat.id} className="overflow-hidden">
                  <div className="relative h-48">
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="bg-red text-white text-[10px] font-bold tracking-[0.15em] uppercase px-2.5 py-1">
                        {cat.tag}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <p className="font-barlow font-black uppercase text-white text-xl tracking-tight leading-none">
                        {cat.name}
                      </p>
                    </div>
                  </div>
                  <div className="bg-sand px-4 py-3 flex items-center justify-between">
                    <p className="text-xs text-muted">{dict.fleet.pricing.daily}</p>
                    <p className="font-barlow font-black text-ink text-2xl">
                      {cat.price}<span className="text-sm text-muted font-normal">{cat.priceUnit}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted text-xs mt-4">
              {dict.fleet.pricing.unlimitedKm}.
            </p>
          </div>

          {/* CTA */}
          <div className="bg-red px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <p className="text-white/60 text-xs tracking-widest uppercase mb-1">{dict.home.cta.eyebrow}</p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,3.5rem)] leading-none tracking-tight text-white">
                {dict.home.hero.checkAvailability}
              </h2>
            </div>
            <Link
              href={`/${lang}/#fleet`}
              className="shrink-0 bg-white text-red font-bold text-xs tracking-widest uppercase px-8 py-4 hover:bg-off-white transition-colors"
            >
              {dict.nav.bookNow} →
            </Link>
          </div>
        </div>
      </main>
      <Footer lang={lang as Locale} t={dict.footer} nav={dict.nav} />
    </>
  );
}
