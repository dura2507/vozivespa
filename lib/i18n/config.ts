// Supported UI locales. Order here is also the order shown in the
// language switcher. The first entry is the default fallback when
// nothing else matches.
export const LOCALES = ["en", "de", "es", "it"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  es: { flag: "🇪🇸", name: "Español" },
  it: { flag: "🇮🇹", name: "Italiano" },
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
