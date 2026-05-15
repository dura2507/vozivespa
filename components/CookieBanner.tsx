"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

// Minimal GDPR-compliant consent banner. Two buttons (accept /
// reject), decision lives in localStorage for 180 days. Google Ads
// gtag only mounts after Accept. Vercel Analytics + our own
// page_views tracker are cookieless so they don't need consent and
// keep running regardless.

type Decision = "accept" | "reject" | null;
const STORAGE_KEY = "consent_decision_v1";
const TTL_MS = 180 * 86_400_000; // 180 days

// Inline copy across the 7 UI locales. Kept short on purpose — long
// disclaimers tank acceptance rate and we mention Google Ads
// specifically so visitors know what they're consenting to.
const COPY: Record<
  string,
  { text: string; accept: string; reject: string }
> = {
  en: {
    text: "We use cookies to measure the performance of our ads.",
    accept: "Accept",
    reject: "Reject",
  },
  de: {
    text: "Wir verwenden Cookies, um die Leistung unserer Anzeigen zu messen.",
    accept: "Akzeptieren",
    reject: "Ablehnen",
  },
  hr: {
    text: "Koristimo kolačiće za mjerenje uspješnosti naših oglasa.",
    accept: "Prihvati",
    reject: "Odbij",
  },
  it: {
    text: "Utilizziamo cookie per misurare l'efficacia delle nostre inserzioni.",
    accept: "Accetta",
    reject: "Rifiuta",
  },
  pl: {
    text: "Używamy plików cookie do mierzenia skuteczności naszych reklam.",
    accept: "Akceptuj",
    reject: "Odrzuć",
  },
  fr: {
    text: "Nous utilisons des cookies pour mesurer la performance de nos publicités.",
    accept: "Accepter",
    reject: "Refuser",
  },
  es: {
    text: "Utilizamos cookies para medir el rendimiento de nuestros anuncios.",
    accept: "Aceptar",
    reject: "Rechazar",
  },
};

function copyForPath(pathname: string | null) {
  if (!pathname) return COPY.en;
  const seg = pathname.split("/")[1];
  return COPY[seg] ?? COPY.en;
}

export function CookieBanner({ googleAdsId }: { googleAdsId?: string }) {
  const pathname = usePathname();
  const copy = copyForPath(pathname);
  const [decision, setDecision] = useState<Decision>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { value: Decision; at: number };
      if (parsed.at && Date.now() - parsed.at < TTL_MS) {
        setDecision(parsed.value);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Bad JSON / quota error — just leave the banner up.
    }
  }, []);

  function save(value: Decision) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ value, at: Date.now() }),
      );
    } catch {
      // Storage may be disabled (Safari private mode); fall back to
      // an in-memory decision so the banner at least disappears.
    }
    setDecision(value);
  }

  if (!hydrated) return null;

  return (
    <>
      {/* Only inject Google Ads gtag once the user has accepted. */}
      {decision === "accept" && googleAdsId && (
        <>
          <Script
            id="gtag-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${googleAdsId}');
            `}
          </Script>
        </>
      )}

      {decision === null && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-ink text-white px-5 py-4 sm:px-8 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.4)]"
          role="dialog"
          aria-label="Cookie consent"
        >
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-6">
            <p className="text-sm leading-relaxed text-white/85">{copy.text}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => save("reject")}
                className="text-xs font-bold tracking-widest uppercase px-4 py-2.5 text-white/80 hover:text-white border border-white/30 hover:border-white transition-colors"
              >
                {copy.reject}
              </button>
              <button
                type="button"
                onClick={() => save("accept")}
                className="text-xs font-bold tracking-widest uppercase px-4 py-2.5 bg-red text-white hover:bg-red-dark transition-colors"
              >
                {copy.accept}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
