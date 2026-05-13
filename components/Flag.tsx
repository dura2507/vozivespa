import type { Locale } from "@/lib/i18n/config";

// Tiny inline SVG flags. All share a 9×6 viewBox (3:2 aspect, the
// international civil flag standard) so they line up perfectly when
// rendered side-by-side. Detail-heavy crests and stripes are dropped
// at this size — they'd just turn into pixel mud anyway.
//
// Codes are ISO 3166-1 alpha-2 country codes (DE, GB, PT...) rather
// than language tags, so we can show e.g. PT for the Portuguese-
// speaking contact without inventing a locale we don't translate to.

export type FlagCode =
  | "DE"
  | "GB"
  | "HR"
  | "IT"
  | "PL"
  | "FR"
  | "ES"
  | "PT";

const FLAGS: Record<FlagCode, React.ReactNode> = {
  GB: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="6" fill="#012169" />
      <path d="M0,0 L9,6 M9,0 L0,6" stroke="#FFF" strokeWidth="0.9" />
      <path d="M0,0 L9,6 M9,0 L0,6" stroke="#C8102E" strokeWidth="0.45" />
      <path d="M4.5,0 V6 M0,3 H9" stroke="#FFF" strokeWidth="1.5" />
      <path d="M4.5,0 V6 M0,3 H9" stroke="#C8102E" strokeWidth="0.9" />
    </svg>
  ),
  DE: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="2" fill="#000" />
      <rect y="2" width="9" height="2" fill="#D00" />
      <rect y="4" width="9" height="2" fill="#FFCE00" />
    </svg>
  ),
  HR: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="2" fill="#FF0000" />
      <rect y="2" width="9" height="2" fill="#FFF" />
      <rect y="4" width="9" height="2" fill="#171796" />
    </svg>
  ),
  IT: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="3" height="6" fill="#009246" />
      <rect x="3" width="3" height="6" fill="#FFF" />
      <rect x="6" width="3" height="6" fill="#CE2B37" />
    </svg>
  ),
  PL: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="3" fill="#FFF" />
      <rect y="3" width="9" height="3" fill="#DC143C" />
    </svg>
  ),
  FR: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="3" height="6" fill="#0055A4" />
      <rect x="3" width="3" height="6" fill="#FFF" />
      <rect x="6" width="3" height="6" fill="#EF4135" />
    </svg>
  ),
  ES: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="1.5" fill="#AA151B" />
      <rect y="1.5" width="9" height="3" fill="#F1BF00" />
      <rect y="4.5" width="9" height="1.5" fill="#AA151B" />
    </svg>
  ),
  PT: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="3.6" height="6" fill="#006600" />
      <rect x="3.6" width="5.4" height="6" fill="#FF0000" />
    </svg>
  ),
};

// Map each UI locale to the country whose flag we want to show for it.
// English → UK by default (where the language originates, common
// convention for European-facing sites).
const LOCALE_TO_FLAG: Record<Locale, FlagCode> = {
  en: "GB",
  de: "DE",
  hr: "HR",
  it: "IT",
  pl: "PL",
  fr: "FR",
  es: "ES",
};

export function Flag({
  code,
  className,
}: {
  code: FlagCode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.08)] [&>svg]:block [&>svg]:w-full [&>svg]:h-full ${className ?? "w-4 h-3"}`}
      aria-hidden
    >
      {FLAGS[code]}
    </span>
  );
}

export function LocaleFlag({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  return <Flag code={LOCALE_TO_FLAG[locale]} className={className} />;
}
