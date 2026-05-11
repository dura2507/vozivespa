import "server-only";
import type { Locale } from "./config";

// Each entry is a dynamic import so the dict only ships with the
// page that actually uses it. Casts the import to the same shape as
// the English dict so TS narrows missing keys at compile time.
import type enDict from "./dictionaries/en.json";
export type Dictionary = typeof enDict;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en.json").then((m) => m.default as Dictionary),
  de: () => import("./dictionaries/de.json").then((m) => m.default as Dictionary),
  es: () => import("./dictionaries/es.json").then((m) => m.default as Dictionary),
  it: () => import("./dictionaries/it.json").then((m) => m.default as Dictionary),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
