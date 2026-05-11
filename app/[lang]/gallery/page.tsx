import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { GALLERY_IMAGES } from "@/lib/mockData";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang as Locale);
  const t = dict.gallery;
  return (
    <>
      <Navbar lang={lang as Locale} t={dict.nav} />
      <main className="pt-32 pb-24 md:pb-16 min-h-screen">

        <div className="px-5 md:px-12 max-w-7xl mx-auto mb-10">
          <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
            {t.eyebrow}
          </p>
          <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,7rem)] leading-none tracking-tight text-ink">
            {t.title}
          </h1>
          <p className="mt-4 text-muted text-base leading-relaxed max-w-2xl">{t.intro}</p>
        </div>

        <div className="px-5 md:px-12 max-w-7xl mx-auto">
          <div className="columns-2 md:columns-3 gap-3 [&>div]:mb-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className="break-inside-avoid overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Gallery ${i + 1}`}
                  loading="lazy"
                  className="w-full h-auto block group-hover:scale-[1.02] transition-transform duration-700"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 md:px-12 max-w-7xl mx-auto mt-16">
          <div className="bg-ink px-8 py-12 md:py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <p className="text-white/50 text-xs tracking-widest uppercase mb-2">{dict.home.cta.eyebrow}</p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] leading-none tracking-tight text-white">
                {dict.home.cta.headline1} {dict.home.cta.headline2}
              </h2>
            </div>
            <Link
              href={`/${lang}/#fleet`}
              className="shrink-0 bg-red text-white font-bold text-xs tracking-widest uppercase px-8 py-4 hover:bg-red-dark transition-colors"
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
