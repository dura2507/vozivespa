import type { Locale } from "@/lib/i18n/config";

// Tiny inline SVG flags for the language switcher. Sized via the
// className passed in (default ~14×10px). 3:2 aspect, no detail
// flourishes — coats of arms wouldn't read at this scale anyway.

const FLAGS: Record<Locale, React.ReactNode> = {
  en: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="6" fill="#012169" />
      <path d="M0,0 L9,6 M9,0 L0,6" stroke="#FFF" strokeWidth="0.9" />
      <path d="M0,0 L9,6 M9,0 L0,6" stroke="#C8102E" strokeWidth="0.45" />
      <path d="M4.5,0 V6 M0,3 H9" stroke="#FFF" strokeWidth="1.5" />
      <path d="M4.5,0 V6 M0,3 H9" stroke="#C8102E" strokeWidth="0.9" />
    </svg>
  ),
  de: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="2" fill="#000" />
      <rect y="2" width="9" height="2" fill="#D00" />
      <rect y="4" width="9" height="2" fill="#FFCE00" />
    </svg>
  ),
  hr: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="2" fill="#FF0000" />
      <rect y="2" width="9" height="2" fill="#FFF" />
      <rect y="4" width="9" height="2" fill="#171796" />
    </svg>
  ),
  it: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="3" height="6" fill="#009246" />
      <rect x="3" width="3" height="6" fill="#FFF" />
      <rect x="6" width="3" height="6" fill="#CE2B37" />
    </svg>
  ),
  pl: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="3" fill="#FFF" />
      <rect y="3" width="9" height="3" fill="#DC143C" />
    </svg>
  ),
  fr: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="3" height="6" fill="#0055A4" />
      <rect x="3" width="3" height="6" fill="#FFF" />
      <rect x="6" width="3" height="6" fill="#EF4135" />
    </svg>
  ),
  es: (
    <svg viewBox="0 0 9 6" preserveAspectRatio="xMidYMid slice">
      <rect width="9" height="1.5" fill="#AA151B" />
      <rect y="1.5" width="9" height="3" fill="#F1BF00" />
      <rect y="4.5" width="9" height="1.5" fill="#AA151B" />
    </svg>
  ),
};

export function LocaleFlag({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  return (
    <span
      className={`inline-block overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.08)] [&>svg]:block [&>svg]:w-full [&>svg]:h-full ${className ?? "w-4 h-3"}`}
      aria-hidden
    >
      {FLAGS[locale]}
    </span>
  );
}
