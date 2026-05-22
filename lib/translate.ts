// Minimal DeepL Free wrapper. Used to translate customer-language
// fields (currently the free-text notes) into German for the owner
// notifications. Activates only when DEEPL_API_KEY is set; without
// the env var we silently fall back to the original text so the
// notification still goes out.
//
// DeepL Free covers 500_000 characters/month at no cost — plenty
// for a small rental's booking volume. API docs:
// https://developers.deepl.com/docs/api-reference/translate

const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

// Map our UI locales to DeepL source language codes. Booking rows
// carry a `locale` field so we know what the customer typed in.
const TO_DEEPL: Record<string, string> = {
  en: "EN",
  de: "DE",
  hr: "HR",
  it: "IT",
  pl: "PL",
  fr: "FR",
  es: "ES",
  // Locales we don't ship a UI for but customers might write in:
  pt: "PT",
};

export type TranslateResult = {
  text: string;
  detectedSource: string | null;
};

// Translates `text` from `sourceLocale` (our internal locale code,
// optional — DeepL auto-detects if omitted) into `targetLang`
// (default "DE"). Returns null on any failure / no API key so
// callers can just fall back to the original.
export async function translate(
  text: string,
  options: { from?: string; to?: "DE" | "EN-GB" | "EN-US" } = {},
): Promise<TranslateResult | null> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return null;
  if (!text.trim()) return null;

  const targetLang = options.to ?? "DE";
  const sourceLang = options.from ? TO_DEEPL[options.from] : undefined;

  // If the source equals the target, skip the round-trip.
  if (sourceLang && sourceLang === targetLang.split("-")[0]) return null;

  try {
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", targetLang);
    if (sourceLang) params.append("source_lang", sourceLang);

    const res = await fetch(DEEPL_URL, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      console.error("[translate] DeepL returned", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      translations?: Array<{ text: string; detected_source_language: string }>;
    };
    const first = data.translations?.[0];
    if (!first) return null;
    // DeepL sometimes returns the same text it was given (e.g. when
    // language detection lands on the target). Don't double-render
    // identical strings.
    if (first.text.trim() === text.trim()) return null;
    return {
      text: first.text,
      detectedSource: first.detected_source_language ?? null,
    };
  } catch (err) {
    console.error("[translate] DeepL fetch failed", err);
    return null;
  }
}

// Does the booking's source locale need translation? German + English
// owners read both natively, so anything else is a candidate.
export function needsTranslationForOwner(locale: string | null | undefined): boolean {
  if (!locale) return false;
  return locale !== "de" && locale !== "en";
}
