"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LOCALES,
  LOCALE_LABELS,
  type Locale,
  isLocale,
} from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type NavStrings = Dictionary["nav"];

function localePath(lang: Locale, path: string): string {
  if (path.startsWith("/#")) return `/${lang}${path.slice(1)}`;
  if (path === "/") return `/${lang}`;
  return `/${lang}${path}`;
}

// Strip the current /xx prefix from a path so we can re-prefix with a
// different locale when the user switches language.
function pathWithoutLocale(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  if (isLocale(segments[0])) {
    const rest = segments.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }
  return pathname;
}

export default function Navbar({
  lang,
  t,
}: {
  lang: Locale;
  t: NavStrings;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const isHome = pathname === `/${lang}` || pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = isHome && !scrolled && !open;
  const textColor = transparent ? "text-white" : "text-ink";
  const hoverColor = transparent ? "hover:text-white/70" : "hover:text-red";

  const LINKS = [
    { label: t.fleet, href: "/#fleet" },
    { label: t.gallery, href: "/gallery" },
    { label: t.info, href: "/info" },
    { label: t.faq, href: "/faq" },
    { label: t.contact, href: "/contact" },
  ];

  const bareHere = pathWithoutLocale(pathname);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          transparent
            ? "bg-black/35 backdrop-blur-sm"
            : "bg-off-white/97 backdrop-blur-md border-b border-ink/8"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between" style={{ height: "6.5rem" }}>
          {/* Logo */}
          <Link href={`/${lang}`} className="flex items-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sickmotos.svg"
              alt="SickMotos"
              className={`h-16 sm:h-20 md:h-24 w-auto transition-all ${
                transparent ? "" : "invert"
              }`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rentamoto.svg"
              alt="Rent a Moto"
              className="h-6 sm:h-7 md:h-9 w-auto -ml-3 sm:-ml-4 md:-ml-5"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={localePath(lang, l.href)}
                scroll={!l.href.includes("#")}
                className={`text-xs font-bold tracking-[0.1em] uppercase transition-colors ${textColor} ${hoverColor} opacity-80 hover:opacity-100`}
              >
                {l.label}
              </Link>
            ))}

            {/* Language switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((o) => !o)}
                onBlur={() => setTimeout(() => setLangOpen(false), 150)}
                className={`text-xs font-bold tracking-[0.1em] uppercase transition-colors ${textColor} ${hoverColor} flex items-center gap-1.5`}
                aria-label={t.languageSwitcher}
                aria-expanded={langOpen}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
                </svg>
                <span>{LOCALE_LABELS[lang].short}</span>
                <svg className={`w-3 h-3 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                className={`absolute right-0 top-full mt-2 bg-white py-1.5 origin-top-right transition-all duration-200 ease-out [filter:drop-shadow(0_10px_28px_rgba(0,0,0,0.2))] ${
                  langOpen
                    ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                }`}
                role="menu"
                aria-hidden={!langOpen}
              >
                {LOCALES.map((l) => {
                  const active = l === lang;
                  return (
                    <Link
                      key={l}
                      href={`/${l}${bareHere === "/" ? "" : bareHere}`}
                      className={`relative flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase transition-colors ${
                        active ? "text-red bg-red/5" : "text-ink hover:bg-ink/5"
                      }`}
                      onClick={() => setLangOpen(false)}
                      role="menuitem"
                    >
                      <span
                        className={`w-1 h-1 rounded-full transition-colors ${
                          active ? "bg-red" : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                      <span>{LOCALE_LABELS[l].name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <Link
              href={localePath(lang, "/#fleet")}
              scroll={false}
              className="ml-2 bg-red text-white text-xs font-bold tracking-[0.15em] uppercase px-6 py-3 hover:bg-red-dark transition-colors"
            >
              {t.bookNow}
            </Link>
          </nav>

          {/* Mobile lang switcher + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((o) => !o)}
                onBlur={() => setTimeout(() => setLangOpen(false), 150)}
                className={`text-xs font-bold tracking-[0.1em] uppercase transition-colors ${textColor} ${hoverColor} flex items-center gap-1.5 px-1`}
                aria-label={t.languageSwitcher}
                aria-expanded={langOpen}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
                </svg>
                <span>{LOCALE_LABELS[lang].short}</span>
                <svg className={`w-3 h-3 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                className={`absolute right-0 top-full mt-2 bg-white py-1.5 z-50 origin-top-right transition-all duration-200 ease-out [filter:drop-shadow(0_10px_28px_rgba(0,0,0,0.2))] ${
                  langOpen
                    ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                }`}
                role="menu"
                aria-hidden={!langOpen}
              >
                {LOCALES.map((l) => {
                  const active = l === lang;
                  return (
                    <Link
                      key={l}
                      href={`/${l}${bareHere === "/" ? "" : bareHere}`}
                      className={`relative flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase transition-colors ${
                        active ? "text-red bg-red/5" : "text-ink hover:bg-ink/5"
                      }`}
                      onClick={() => setLangOpen(false)}
                      role="menuitem"
                    >
                      <span
                        className={`w-1 h-1 rounded-full transition-colors ${
                          active ? "bg-red" : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                      <span>{LOCALE_LABELS[l].name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          <button
            className={`w-9 h-9 flex flex-col items-center justify-center gap-[5px] ${textColor}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={t.menuAria}
          >
            <span className={`block w-5 h-[1.5px] bg-current transition-all duration-200 origin-center ${open ? "rotate-45 translate-y-[6.5px]" : ""}`} />
            <span className={`block w-5 h-[1.5px] bg-current transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-[1.5px] bg-current transition-all duration-200 origin-center ${open ? "-rotate-45 -translate-y-[6.5px]" : ""}`} />
          </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className={`md:hidden bg-off-white overflow-hidden transition-all duration-300 ${
            open ? "max-h-[40rem] pb-6 border-t border-ink/8" : "max-h-0"
          }`}
        >
          <nav className="flex flex-col px-5 pt-3">
            <Link
              href={`/${lang}`}
              onClick={() => setOpen(false)}
              className="py-3 text-sm font-semibold text-ink border-b border-ink/8 tracking-wide"
            >
              {t.home}
            </Link>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={localePath(lang, l.href)}
                scroll={!l.href.includes("#")}
                onClick={() => setOpen(false)}
                className="py-3 text-sm font-semibold text-ink border-b border-ink/8 tracking-wide hover:text-red transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={localePath(lang, "/#fleet")}
              scroll={false}
              onClick={() => setOpen(false)}
              className="mt-4 bg-red text-white text-center text-sm font-bold tracking-widest uppercase py-3"
            >
              {t.bookNow}
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
