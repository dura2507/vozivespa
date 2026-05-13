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
  PT: (
    <svg viewBox="0 0 90 60" preserveAspectRatio="xMidYMid slice">
      <rect width="36" height="60" fill="#006600" />
      <rect x="36" width="54" height="60" fill="#FF0000" />
      {/* Armillary sphere — concentric rings + crossing bands, sitting
          on the green/red boundary. Then the small Portuguese shield
          (white with blue inner shield) layered on top. */}
      <g transform="translate(36 30)">
        {/* Armillary sphere */}
        <g fill="none" stroke="#FFCC00" strokeWidth="1.2">
          <circle r="11" />
          <ellipse rx="11" ry="4" />
          <ellipse rx="4" ry="11" />
          <path d="M-11 0 H11 M0 -11 V11" strokeWidth="0.8" />
        </g>
        {/* White shield body */}
        <path
          d="M-5.5 -8 H5.5 V2 Q5.5 7 0 9 Q-5.5 7 -5.5 2 Z"
          fill="#FFF"
          stroke="#FFCC00"
          strokeWidth="0.5"
        />
        {/* Red border inside shield */}
        <path
          d="M-4.3 -6.5 H4.3 V1.8 Q4.3 5.7 0 7.5 Q-4.3 5.7 -4.3 1.8 Z"
          fill="#FF0000"
        />
        {/* Inner white cross-of-shields */}
        <g fill="#002A8F">
          <rect x="-0.9" y="-5.5" width="1.8" height="3.6" />
          <rect x="-0.9" y="-1.2" width="1.8" height="3.6" />
          <rect x="-0.9" y="3.1" width="1.8" height="3.6" />
          <rect x="-3.7" y="-1.2" width="1.8" height="3.6" />
          <rect x="1.9" y="-1.2" width="1.8" height="3.6" />
        </g>
      </g>
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
