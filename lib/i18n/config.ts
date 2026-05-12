// Supported UI locales. Order here is also the order shown in the
// language switcher. The first entry is the default fallback when
// nothing else matches.
export const LOCALES = ["en", "de", "es", "it"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  de: { short: "DE", name: "Deutsch" },
  es: { short: "ES", name: "Español" },
  it: { short: "IT", name: "Italiano" },
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
