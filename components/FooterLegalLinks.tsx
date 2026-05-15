"use client";

import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { LEGAL_STRINGS } from "@/lib/legal-content";
import { cookieSettingsLabel, openCookieSettings } from "@/components/CookieBanner";

// Three legal-housekeeping links pinned to the footer.
// The Cookie-settings button is interactive (re-opens the banner via
// a window event), the other two are normal page links.
export function FooterLegalLinks({ lang }: { lang: Locale }) {
  const s = LEGAL_STRINGS[lang];
  const settingsLabel = cookieSettingsLabel(`/${lang}`);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-white/55">
      <Link
        href={`/${lang}/privacy`}
        className="hover:text-white transition-colors"
      >
        {s.privacyTitle}
      </Link>
      <span className="text-white/20" aria-hidden>
        ·
      </span>
      <Link
        href={`/${lang}/impressum`}
        className="hover:text-white transition-colors"
      >
        {s.imprintTitle}
      </Link>
      <span className="text-white/20" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={openCookieSettings}
        className="hover:text-white transition-colors"
      >
        {settingsLabel}
      </button>
    </div>
  );
}
