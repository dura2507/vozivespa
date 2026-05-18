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
  | "BR";

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
    <svg viewBox="0 0 90 60" preserveAspectRatio="xMidYMid slice">
      <rect width="90" height="20" fill="#FF0000" />
      <rect y="20" width="90" height="20" fill="#FFF" />
      <rect y="40" width="90" height="20" fill="#171796" />
      <defs>
        <clipPath id="hr-shield-clip">
          <path d="M38 18 H52 V30 Q52 36 45 40 Q38 36 38 30 Z" />
        </clipPath>
      </defs>
      {/* Crown of five mini-shields above the main shield */}
      <g fill="#FFF" stroke="#171796" strokeWidth="0.5" transform="translate(38 13)">
        <path d="M0 5 V1.5 L1.2 0 H2.4 V3.5 H1 V5 Z" />
        <path d="M3 5 V0 H5 V3.5 H4 V5 Z" />
        <path d="M5.6 5 V1.5 L6.8 0 H8 V5 Z" />
        <path d="M8.6 5 V0 H10.6 V3.5 H9.6 V5 Z" />
        <path d="M11.2 5 V1.5 L12.4 0 H13.6 V5 Z" />
      </g>
      {/* Shield outline + checkered fill clipped to shield shape */}
      <path
        d="M38 18 H52 V30 Q52 36 45 40 Q38 36 38 30 Z"
        fill="#FFF"
        stroke="#171796"
        strokeWidth="0.7"
      />
      <g clipPath="url(#hr-shield-clip)" fill="#FF0000">
        <rect x="38" y="18" width="2.8" height="2.8" />
        <rect x="43.6" y="18" width="2.8" height="2.8" />
        <rect x="49.2" y="18" width="2.8" height="2.8" />
        <rect x="40.8" y="20.8" width="2.8" height="2.8" />
        <rect x="46.4" y="20.8" width="2.8" height="2.8" />
        <rect x="38" y="23.6" width="2.8" height="2.8" />
        <rect x="43.6" y="23.6" width="2.8" height="2.8" />
        <rect x="49.2" y="23.6" width="2.8" height="2.8" />
        <rect x="40.8" y="26.4" width="2.8" height="2.8" />
        <rect x="46.4" y="26.4" width="2.8" height="2.8" />
        <rect x="38" y="29.2" width="2.8" height="2.8" />
        <rect x="43.6" y="29.2" width="2.8" height="2.8" />
        <rect x="49.2" y="29.2" width="2.8" height="2.8" />
        <rect x="40.8" y="32" width="2.8" height="2.8" />
        <rect x="46.4" y="32" width="2.8" height="2.8" />
        <rect x="38" y="34.8" width="2.8" height="2.8" />
        <rect x="43.6" y="34.8" width="2.8" height="2.8" />
        <rect x="49.2" y="34.8" width="2.8" height="2.8" />
        <rect x="40.8" y="37.6" width="2.8" height="2.8" />
        <rect x="46.4" y="37.6" width="2.8" height="2.8" />
      </g>
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
  BR: (
    <svg viewBox="0 0 90 60" preserveAspectRatio="xMidYMid slice">
      {/* Green field */}
      <rect width="90" height="60" fill="#009C3B" />
      {/* Yellow rhombus, slightly inset */}
      <polygon points="45,5 85,30 45,55 5,30" fill="#FFDF00" />
      {/* Blue celestial sphere */}
      <circle cx="45" cy="30" r="13" fill="#002776" />
      {/* White equatorial band ("Ordem e Progresso") */}
      <path
        d="M32 28 A 16 16 0 0 1 58 28 L 58 31 A 16 16 0 0 0 32 31 Z"
        fill="#FFFFFF"
      />
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
