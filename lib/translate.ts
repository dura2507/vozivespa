// Minimal DeepL Free wrapper. Used to translate customer-language
// fields (booking notes + contact-form messages) into English for the
// owner notifications. Activates only when DEEPL_API_KEY is set;
// without the env var we silently fall back to the original text so
// the notification still goes out.
//
// DeepL Free covers 500_000 characters/month at no cost — plenty
// for a small rental's booking volume. API docs:
// https://developers.deepl.com/docs/api-reference/translate

import { retry } from "@/lib/retry";

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
  if (!text.trim()) return null;
  const key = process.env.DEEPL_API_KEY;
  // No DeepL key configured → use the keyless fallback so the feature
  // still works out of the box. DeepL is preferred (better quality) when
  // a key is present.
  if (!key) return translateFallback(text, options);

  const targetLang = options.to ?? "EN-GB";
  const sourceLang = options.from ? TO_DEEPL[options.from] : undefined;

  // If the source equals the target, skip the round-trip.
  if (sourceLang && sourceLang === targetLang.split("-")[0]) return null;

  try {
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", targetLang);
    if (sourceLang) params.append("source_lang", sourceLang);

    // Retry transient DeepL failures (429 rate-limit, 5xx, network) with
    // backoff — same resilience every other outbound call here already has.
    // Permanent errors (bad key 401/403, quota-exhausted 456) are NOT retried;
    // they fall through to the keyless fallback below. If the retries are
    // exhausted the throw is caught by the outer catch → fallback.
    const res = await retry(
      "translate-deepl",
      async () => {
        const r = await fetch(DEEPL_URL, {
          method: "POST",
          headers: {
            Authorization: `DeepL-Auth-Key ${key}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        if (r.status === 429 || r.status >= 500) throw new Error(`DeepL ${r.status}`);
        return r;
      },
      { attempts: 3, baseDelayMs: 400 },
    );
    if (!res.ok) {
      console.error("[translate] DeepL returned", res.status, await res.text().catch(() => ""));
      return translateFallback(text, options);
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
    return translateFallback(text, options);
  }
}

// Keyless fallback via Google's public translate endpoint. Auto-detects
// the source (sl=auto) so it handles any language — German included —
// without needing a DeepL account. Low volume (a handful of booking /
// contact pings) stays well under any rate limit. Returns null on any
// failure so the caller just shows the original text.
async function translateFallback(
  text: string,
  options: { from?: string; to?: "DE" | "EN-GB" | "EN-US" } = {},
): Promise<TranslateResult | null> {
  const target = (options.to ?? "EN-GB").split("-")[0].toLowerCase(); // en / de
  const source = options.from ? options.from.toLowerCase() : "auto";
  if (source !== "auto" && source === target) return null;
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx" +
      `&sl=${encodeURIComponent(source)}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    // Retry the throttle-prone keyless endpoint (429/403/5xx → transient on
    // Vercel's shared egress IPs) instead of silently giving up first try.
    // On final failure the throw is caught below → null (contract preserved),
    // and now it's logged so the intermittency is diagnosable.
    const res = await retry(
      "translate-google",
      async () => {
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!r.ok) throw new Error(`Google translate ${r.status}`);
        return r;
      },
      { attempts: 3, baseDelayMs: 400 },
    );
    // Shape: [[["translated","original",...], ...], ..., "detectedSrc"]
    const data = (await res.json()) as [Array<[string, string]>, unknown, string];
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    const translated = segments.map((s) => s?.[0] ?? "").join("").trim();
    const detected = typeof data?.[2] === "string" ? data[2] : null;
    if (!translated) return null;
    // Source already the target language → nothing to add.
    if (detected && detected.toLowerCase() === target) return null;
    if (translated === text.trim()) return null;
    return { text: translated, detectedSource: detected };
  } catch (err) {
    console.error("[translate] fallback failed", err);
    return null;
  }
}

// NOTE: the old needsTranslationForOwner(siteLocale) gate was removed — it
// keyed on the SITE language the visitor had selected, so a note written in
// German/Czech on an English-set site was never translated. All owner
// notifications now call translate() with auto-detect (no `from`), which
// returns null for already-English text, so the site locale is irrelevant.
