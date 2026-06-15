import Link from "next/link";
import { BRAND } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { FooterLegalLinks } from "@/components/FooterLegalLinks";

function localePath(lang: Locale, path: string): string {
  if (path.startsWith("/#")) return `/${lang}${path.slice(1)}`;
  if (path === "/") return `/${lang}`;
  return `/${lang}${path}`;
}

export default function Footer({
  lang,
  t,
  nav,
}: {
  lang: Locale;
  t: Dictionary["footer"];
  nav: Dictionary["nav"];
}) {
  const NAV_LINKS = [
    { label: nav.fleet, href: "/#fleet" },
    { label: nav.gallery, href: "/gallery" },
    { label: nav.info, href: "/info" },
    { label: nav.faq, href: "/faq" },
    { label: nav.contact, href: "/contact" },
    { label: nav.terms, href: "/terms" },
  ];
  return (
    <footer className="bg-ink text-white/60">
      <div className="max-w-5xl mx-auto px-5 md:px-12 py-16 flex flex-col items-center text-center">
        {/* Brand */}
        <Link href={`/${lang}`} className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sickmotos.svg"
            alt="SickMotos"
            className="h-28 sm:h-32 w-auto"
          />
        </Link>
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 mb-6">
          {BRAND.tagline} · {t.locationLabel}
        </p>
        <p className="text-sm leading-relaxed text-white/50 max-w-md mb-10">
          {t.intro}
        </p>

        {/* Navigation */}
        <nav className="flex flex-wrap justify-center gap-x-7 gap-y-3 mb-10">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={localePath(lang, link.href)}
              className="text-xs font-bold tracking-[0.15em] uppercase text-white/55 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Contact details (phone / WhatsApp) intentionally NOT in the
            footer (owner request): visitors should engage with the site +
            FAQ before reaching out instead of calling for every little
            thing. Contact lives only inside the booking flow on the bike
            detail page. */}

        {/* Instagram + Address */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-3 text-sm mb-8">
          <a
            href={BRAND.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/55 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
            @{BRAND.instagram}
          </a>
          <a
            href={BRAND.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/55 hover:text-white transition-colors"
            title="Open in Google Maps"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {BRAND.address}
          </a>
        </div>

        {/* Trusted Rental Partner badge */}
        <div className="flex flex-col items-center gap-3 mt-2 mb-2">
          <p className="text-[10px] tracking-[0.25em] uppercase text-white/40 font-bold">
            {t.trusted}
          </p>
          <a
            href="https://riderly.com/rental-locations/croatia/zadar/"
            target="_blank"
            rel="noopener noreferrer"
            title={t.trusted}
            className="opacity-80 hover:opacity-100 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.riderly.com/storage/badges/partner-R4.png"
              alt="Riderly"
              className="h-20 w-auto"
            />
          </a>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 w-full text-xs text-white/30 space-y-3">
          <FooterLegalLinks lang={lang} />
          <div className="space-y-1">
            <p>{BRAND.legal} · OIB: {BRAND.oib} · {t.openHoursPrefix} {BRAND.hours}</p>
            <p>© {new Date().getFullYear()} {BRAND.name}. {t.rights}</p>
          </div>
        </div>

        {/* Agency credit */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-sm tracking-wide text-white/55">
            made with{" "}
            <span className="text-red/80" aria-hidden>
              ♡
            </span>{" "}
            by
          </p>
          <a
            href="https://krileo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block opacity-80 hover:opacity-100 transition-opacity"
            aria-label="Krileo — krileo.com"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/krileo-full.png"
              alt="Krileo"
              className="h-10 sm:h-12 w-auto"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
