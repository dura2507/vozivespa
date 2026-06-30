// Supported UI locales. Order here is also the order shown in the
// language switcher. The first entry is the default fallback when
// nothing else matches.
export const LOCALES = ["en", "de", "hr", "it", "pl", "fr", "es", "hu", "sk", "cs", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  de: { short: "DE", name: "Deutsch" },
  hr: { short: "HR", name: "Hrvatski" },
  it: { short: "IT", name: "Italiano" },
  pl: { short: "PL", name: "Polski" },
  fr: { short: "FR", name: "Français" },
  es: { short: "ES", name: "Español" },
  hu: { short: "HU", name: "Magyar" },
  sk: { short: "SK", name: "Slovenčina" },
  cs: { short: "CZ", name: "Čeština" },
  pt: { short: "PT", name: "Português (BR)" },
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
