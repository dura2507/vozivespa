import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Flag, type FlagCode } from "@/components/Flag";
import { GALLERY_IMAGES, BRAND, LICENCE_BADGE, REVIEWS } from "@/lib/mockData";
import ReviewCarousel from "@/components/ReviewCarousel";
import { getCategoriesWithPricing, getUnitCounts, getAvailableNowCounts } from "@/lib/bike-pricing";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

// Slice a Zagreb-local timestamp into its calendar parts so we can
// pick a same-day vs cross-day pill template + render DD.MM ourselves
// without Intl's locale-dependent separator.
function zagrebParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
  };
}

// Pick one of three pill templates so the visitor sees relative time
// for today/tomorrow ("heute 16:30" / "morgen 09:00") and a plain date
// for anything further out — full timestamp on a far-off day is noise.
function bookedUntilInfo(
  targetMs: number,
  nowMs: number,
):
  | { kind: "today"; time: string }
  | { kind: "tomorrow"; time: string }
  | { kind: "later"; date: string } {
  const t = zagrebParts(targetMs);
  const n = zagrebParts(nowMs);
  const tomorrow = zagrebParts(nowMs + 86_400_000);
  if (t.year === n.year && t.month === n.month && t.day === n.day) {
    return { kind: "today", time: `${t.hour}:${t.minute}` };
  }
  if (
    t.year === tomorrow.year &&
    t.month === tomorrow.month &&
    t.day === tomorrow.day
  ) {
    return { kind: "tomorrow", time: `${t.hour}:${t.minute}` };
  }
  return { kind: "later", date: `${t.day}.${t.month}` };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang as Locale);
  const t = dict.home;
  const [CATEGORIES, unitCounts, availableNow] = await Promise.all([
    getCategoriesWithPricing(),
    getUnitCounts(),
    getAvailableNowCounts(),
  ]);
  const nowMs = Date.now();

  // Hero "from XX€" label tracks the cheapest day price across the
  // current fleet (mockData defaults + admin overrides), so a price
  // change in /admin/pricing flows through automatically.
  const cheapestDayPrice = CATEGORIES.reduce<number>((min, cat) => {
    const n = parseInt(cat.pricing.day.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n > 0 && n < min ? n : min;
  }, Number.POSITIVE_INFINITY);
  const fromPriceLabel = Number.isFinite(cheapestDayPrice) ? `${cheapestDayPrice}€` : "35€";

  const INCLUDED = [
    { key: "insurance", icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    )},
    { key: "helmets", icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14a8 8 0 0116 0v3.5a1.5 1.5 0 01-1.5 1.5H17v-2h-2v2H9v-2H7v2H5.5A1.5 1.5 0 014 17.5V14z" />
        <path d="M4.5 14h15" />
        <path d="M9.5 9.5c.8-.5 1.7-.8 2.5-.8s1.7.3 2.5.8" />
      </svg>
    )},
    { key: "unlimitedKm", icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    )},
    { key: "roadside", icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    )},
    { key: "transparent", icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    )},
    { key: "warranty", icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ] as const;

  const HOW_IT_WORKS = [
    { n: "01", title: t.howItWorks.step1.title, text: t.howItWorks.step1.text },
    { n: "02", title: t.howItWorks.step2.title, text: t.howItWorks.step2.text },
    { n: "03", title: t.howItWorks.step3.title, text: t.howItWorks.step3.text },
  ];

  return (
    <>
      <Navbar lang={lang as Locale} t={dict.nav} />

      {/* HERO */}
      <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden pt-32 pb-24 bg-ink">
        <Image
          src="/bikes/hero.jpg"
          alt="SickMotos bike rental Zadar"
          fill
          priority
          className="object-cover object-center opacity-60"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 md:px-12">
          <p className="text-white/70 text-[11px] tracking-[0.3em] uppercase mb-5 font-medium">
            {t.hero.eyebrow} · {BRAND.tagline}
          </p>
          <h1 className="font-barlow font-black uppercase text-white leading-[0.9] text-[clamp(3rem,12vw,9rem)] tracking-tight">
            {t.hero.headline1}<br />{t.hero.headline2}<br />{t.hero.headline3}
          </h1>
          <p className="text-white/75 text-base md:text-lg mt-6 mb-8 leading-relaxed max-w-md">
            {t.hero.sub}
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <Link
              href={`/${lang}/#fleet`}
              className="inline-flex items-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-red-dark transition-colors"
            >
              {t.hero.checkAvailability}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <span className="text-white/60 text-sm">{fmt(t.hero.fromPrice, { price: fromPriceLabel })}</span>
          </div>
        </div>

        <div className="absolute bottom-8 right-8 md:right-12 hidden md:flex gap-12 text-right">
          {[[String(Object.values(unitCounts).reduce((s, n) => s + n, 0)), t.hero.statBikes], ["50+", t.hero.statReviews], ["∞", t.hero.statKm]].map(
            ([num, label]) => (
              <div key={label}>
                <p className="font-barlow font-black text-4xl text-white leading-none">{num}</p>
                <p className="text-white/55 text-[11px] tracking-wider uppercase mt-1">{label}</p>
              </div>
            )
          )}
        </div>
      </section>

      <main className="pb-20 md:pb-0">

        {/* GOOGLE TRUST STRIP — visible Google rating right under the
            hero so visitors get a social-proof signal before scrolling
            into the fleet. Links straight to our Google Maps listing. */}
        <section className="bg-white border-y border-ink/10 py-5 md:py-6">
          <a
            href={BRAND.reviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-5xl mx-auto px-5 md:px-12 flex flex-wrap items-center justify-center gap-4 sm:gap-6 group"
          >
            {/* Official Google G in its four brand colours. */}
            <svg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path d="M21.6 12.227c0-.709-.06-1.39-.17-2.045H12v3.866h5.382a4.6 4.6 0 0 1-2 3.018v2.51h3.232c1.892-1.745 2.986-4.314 2.986-7.349Z" fill="#4285F4"/>
              <path d="M12 22c2.7 0 4.964-.895 6.618-2.424l-3.232-2.51c-.895.6-2.04.954-3.386.954-2.604 0-4.81-1.76-5.597-4.122H3.064v2.59A9.997 9.997 0 0 0 12 22Z" fill="#34A853"/>
              <path d="M6.404 13.898a6.018 6.018 0 0 1 0-3.795V7.513H3.064a10.003 10.003 0 0 0 0 8.974l3.34-2.59Z" fill="#FBBC04"/>
              <path d="M12 5.977c1.47 0 2.785.504 3.823 1.494l2.866-2.866C16.96 3.041 14.694 2 12 2A9.997 9.997 0 0 0 3.064 7.514l3.34 2.59C7.192 7.738 9.398 5.977 12 5.977Z" fill="#EA4335"/>
            </svg>
            <div className="flex items-baseline gap-2.5">
              <span className="font-barlow font-black text-2xl sm:text-3xl text-ink leading-none tabular-nums">4.9</span>
              <span className="text-amber-400 text-lg sm:text-xl leading-none tracking-[2px]">★★★★★</span>
            </div>
            <span className="text-xs sm:text-sm text-ink/60 group-hover:text-red transition-colors hidden sm:inline">
              {t.reviews.leaveReview} →
            </span>
          </a>
        </section>

        {/* FLEET */}
        <section id="fleet" className="px-5 md:px-12 pt-20 pb-16 max-w-7xl mx-auto scroll-mt-32">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">{t.fleet.eyebrow}</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,5rem)] leading-none tracking-tight text-ink">
              {t.fleet.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 max-w-7xl mx-auto">
            {CATEGORIES.map((cat) => {
              const bikeDict = dict.bikes[cat.id as keyof typeof dict.bikes];
              const avail = availableNow[cat.id];
              // Three rendered states for the at-a-glance status pill:
              //   green   → ≥1 unit free this very moment
              //   amber   → every unit currently in service (no rental)
              //   neutral → unavailable for another reason (rented)
              //   hidden  → no fleet data yet (don't show a lying badge)
              const availState =
                !avail || avail.total === 0
                  ? "unknown"
                  : avail.available > 0
                    ? "available"
                    : avail.cause === "service"
                      ? "service"
                      : "rented";
              return (
              <div key={cat.id} className="group flex flex-col bg-sand">
                <Link href={`/${lang}/fleet/${cat.id}`} className="relative overflow-hidden aspect-square bg-sand block">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover object-bottom transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-red text-white px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg">
                    <p className="font-barlow font-black text-xl sm:text-2xl leading-none">
                      {cat.priceFrom && (
                        <span className="text-[10px] font-normal opacity-80 mr-1 align-middle">{t.fleet.fromPrefix}</span>
                      )}
                      {cat.price}
                      <span className="text-xs font-normal opacity-80 ml-0.5">{cat.priceUnit}</span>
                    </p>
                  </div>
                </Link>
                <Link href={`/${lang}/fleet/${cat.id}`} className="px-5 pt-5 pb-3 sm:px-6 sm:pt-7 sm:pb-4 text-center flex flex-col flex-1 block">
                  <h3 className="font-barlow font-black text-ink text-2xl sm:text-3xl uppercase tracking-wide leading-none mb-2">
                    {cat.name}
                  </h3>
                  {availState !== "unknown" && (
                    <p
                      className={`inline-flex self-center items-center gap-1.5 text-[11px] tracking-[0.1em] uppercase font-bold mb-3 px-2.5 py-1 ${
                        availState === "available"
                          ? "bg-emerald-100 text-emerald-700"
                          : availState === "service"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-ink/10 text-ink/70"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          availState === "available"
                            ? "bg-emerald-500 animate-pulse"
                            : availState === "service"
                              ? "bg-amber-500"
                              : "bg-ink/50"
                        }`}
                        aria-hidden
                      />
                      {(() => {
                        if (availState === "available") return t.fleet.availableNow;
                        if (availState === "service") return t.fleet.outOfService;
                        if (!avail?.availableFromMs || avail.availableFromMs <= nowMs) {
                          return t.fleet.notAvailableNow;
                        }
                        const info = bookedUntilInfo(avail.availableFromMs, nowMs);
                        if (info.kind === "today") {
                          return fmt(t.fleet.bookedUntilToday, { time: info.time });
                        }
                        if (info.kind === "tomorrow") {
                          return fmt(t.fleet.bookedUntilTomorrow, { time: info.time });
                        }
                        return fmt(t.fleet.bookedUntil, { date: info.date });
                      })()}
                    </p>
                  )}
                  {unitCounts[cat.id] > 1 && (
                    <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-red mb-3">
                      {fmt(t.fleet.inStock, { n: unitCounts[cat.id] })}
                    </p>
                  )}
                  <p className="text-xs sm:text-sm text-muted leading-relaxed mb-3">{bikeDict?.description ?? cat.description}</p>
                  <div className="flex flex-row items-center justify-center gap-4 mb-3 sm:flex-col sm:gap-1">
                    <Image
                      src={LICENCE_BADGE[cat.licenceCode]}
                      alt={`${cat.licenceCode} licence required`}
                      width={240}
                      height={240}
                      quality={100}
                      className="w-20 h-20 sm:w-24 sm:h-24"
                    />
                    <div className="text-left leading-tight sm:text-center">
                      <p className="text-[9px] tracking-[0.2em] uppercase text-ink/40 font-bold">
                        {t.fleet.topSpeed}
                      </p>
                      <p className="text-base font-bold text-ink">{cat.maxSpeed}</p>
                    </div>
                  </div>
                  {cat.experienceNote && (
                    <p className="text-[10px] tracking-[0.15em] uppercase text-red font-bold mb-3">
                      {t.fleet.experienceRequired}
                    </p>
                  )}
                </Link>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1.4fr] gap-px bg-ink/10 mt-auto">
                  <Link
                    href={`/${lang}/fleet/${cat.id}`}
                    className="bg-sand text-ink font-bold text-[11px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] uppercase py-3 px-2 sm:px-3 text-center hover:bg-off-white transition-colors"
                  >
                    {t.fleet.viewDetails}
                  </Link>
                  <Link
                    href={`/${lang}/fleet/${cat.id}#book`}
                    className="inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-red text-white font-bold text-[11px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] uppercase py-3 px-2 sm:px-3 hover:bg-red-dark hover:gap-3 transition-all"
                  >
                    {t.fleet.bookNow}
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </div>
              );
            })}
          </div>
        </section>

        {/* WhatsApp dual-contact CTA — placed directly below the fleet
            so visitors who skimmed the bikes can immediately reach out
            in their preferred language. Owner explicitly asked for both
            numbers here. */}
        <section className="bg-ink text-white px-5 md:px-12 py-12 md:py-16">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <p className="text-white/60 text-xs tracking-widest uppercase mb-2">
                {dict.faq.eyebrow}
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3rem)] leading-[0.95] tracking-tight">
                WhatsApp
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              {BRAND.contacts.map((contact) => (
                <a
                  key={contact.phoneRaw}
                  href={`https://wa.me/${contact.phoneRaw}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 bg-red text-white font-bold text-sm tracking-widest uppercase px-6 py-4 hover:bg-red-dark transition-colors"
                >
                  <span className="flex gap-1">
                    {contact.languages.map((c) => (
                      <Flag key={c} code={c as FlagCode} className="w-4 h-3" />
                    ))}
                  </span>
                  {contact.phone} →
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* INCLUDED */}
        <section className="bg-sand px-5 md:px-12 py-20">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">{t.included.eyebrow}</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink mb-12">
              {t.included.title}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
              {INCLUDED.map((item) => {
                const labels = t.included.items[item.key];
                return (
                  <div key={item.key} className="flex flex-col items-center text-center gap-3">
                    <span className="text-ink/70">{item.icon}</span>
                    <p className="font-semibold text-sm text-ink">{labels.label}</p>
                    <p className="text-xs text-muted leading-relaxed">{labels.sub}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* GOOD TO KNOW */}
        <section className="px-5 md:px-12 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">{t.goodToKnow.eyebrow}</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink">
              {t.goodToKnow.title}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
            <div className="bg-off-white px-6 py-7 flex flex-col items-start gap-3">
              <span className="font-barlow font-black text-3xl text-red leading-none">{BRAND.deposit}</span>
              <p className="font-bold text-ink text-sm">{t.goodToKnow.deposit.label}</p>
              <p className="text-xs text-muted leading-relaxed">{t.goodToKnow.deposit.sub}</p>
            </div>
            <div className="bg-off-white px-6 py-7 flex flex-col items-start gap-3">
              <span className="font-barlow font-black text-3xl text-red leading-none">{t.goodToKnow.phoneHolders.value}</span>
              <p className="font-bold text-ink text-sm">{t.goodToKnow.phoneHolders.label}</p>
              <p className="text-xs text-muted leading-relaxed">{t.goodToKnow.phoneHolders.sub}</p>
            </div>
            <div className="bg-off-white px-6 py-7 flex flex-col items-start gap-3">
              <span className="font-barlow font-black text-3xl text-red leading-none">{t.goodToKnow.season.value}</span>
              <p className="font-bold text-ink text-sm">{t.goodToKnow.season.label}</p>
              <p className="text-xs text-muted leading-relaxed">{t.goodToKnow.season.sub}</p>
            </div>
            <div className="bg-off-white px-6 py-7 flex flex-col items-start gap-3">
              <span className="flex gap-2 leading-none">
                {BRAND.languages.map((c) => (
                  <Flag key={c} code={c as FlagCode} className="w-7 h-5" />
                ))}
              </span>
              <p className="font-bold text-ink text-sm">{t.goodToKnow.languages.label}</p>
              <p className="text-xs text-muted leading-relaxed">{t.goodToKnow.languages.sub}</p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-ink px-5 md:px-12 py-20">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/40 mb-2">{t.howItWorks.eyebrow}</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-white mb-14">
              {t.howItWorks.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.n} className="flex flex-col items-center text-center">
                  <p className="font-barlow font-black text-[5rem] leading-none text-red/30 mb-2 select-none">
                    {step.n}
                  </p>
                  <h3 className="font-barlow font-bold text-2xl uppercase tracking-tight text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-sm text-white/55 leading-relaxed max-w-xs">{step.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-14 flex justify-center">
              <Link
                href={`/${lang}/#fleet`}
                className="inline-flex items-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-red-dark transition-colors"
              >
                {t.howItWorks.cta} →
              </Link>
            </div>
          </div>
        </section>

        {/* REVIEWS — hand-curated from the Google Business Profile.
            Free, no third-party widget, no view limits. Update
            REVIEWS in lib/mockData.ts when a new great review lands
            (paste author + date + text). */}
        <section className="px-5 md:px-12 py-20 max-w-7xl mx-auto text-center">
          <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
            {t.reviews.eyebrow}
          </p>
          <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink mb-12">
            {t.reviews.title}
          </h2>
          <ReviewCarousel reviews={REVIEWS} />
          <a
            href={BRAND.reviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-red font-bold text-xs tracking-[0.2em] uppercase border-b-2 border-red pb-1 mt-10 hover:gap-3 transition-all"
          >
            {t.reviews.leaveReview}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </section>

        {/* GALLERY STRIP */}
        <section className="pb-20">
          <div className="px-5 md:px-12 max-w-7xl mx-auto mb-8 text-center">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">{t.gallerySection.eyebrow}</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink">
              {t.gallerySection.title}
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 md:px-12 pb-2 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
            {GALLERY_IMAGES.map((src, i) => (
              <div
                key={i}
                className="relative shrink-0 snap-start overflow-hidden"
                style={{ width: "clamp(240px, 40vw, 380px)", height: "clamp(300px, 50vw, 480px)" }}
              >
                <Image
                  src={src}
                  alt={`Gallery ${i + 1}`}
                  fill
                  className="object-cover hover:scale-105 transition-transform duration-700"
                  sizes="380px"
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Link href={`/${lang}/gallery`} className="text-sm text-muted underline underline-offset-4 hover:text-red transition-colors">
              {t.gallerySection.seeAll} →
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-5 md:mx-12 mb-6 bg-red text-white px-8 md:px-12 py-14 md:py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <p className="text-white/60 text-xs tracking-widest uppercase mb-3">{t.cta.eyebrow}</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] tracking-tight">
              {t.cta.headline1}<br />{t.cta.headline2}
            </h2>
          </div>
          <Link
            href={`/${lang}/#fleet`}
            className="shrink-0 inline-flex items-center gap-2 bg-white text-red font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-off-white transition-colors"
          >
            {t.cta.ctaBtn} →
          </Link>
        </section>

      </main>

      <Footer lang={lang as Locale} t={dict.footer} nav={dict.nav} />
    </>
  );
}
