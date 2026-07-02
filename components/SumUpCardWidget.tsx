"use client";

import { useEffect, useRef, useState } from "react";

// Mounts the SumUp Payment Widget for a server-created checkout. After the
// widget reports "success", we call /api/payments/verify which re-reads
// the checkout from SumUp server-side (the SDK success callback is NOT
// proof of payment on its own).
//
// SDK docs: https://developer.sumup.com/online-payments/checkouts/card-widget

type Props = {
  bookingId: string;
  checkoutId: string;
  amountCents: number;
  currency: string; // "EUR"
  locale: string; // "de", "en", ...
  onPaid: () => void;
  onFail: (message: string) => void;
};

type SumUpMountConfig = {
  id: string;
  checkoutId: string;
  locale?: string;
  onResponse: (type: string, body: unknown) => void;
};
type SumUpCardInstance = { unmount?: () => void };
type SumUpCardGlobal = { mount: (cfg: SumUpMountConfig) => SumUpCardInstance };

declare global {
  interface Window {
    SumUpCard?: SumUpCardGlobal;
  }
}

const SDK_URL = "https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js";

// Loads the SumUp SDK once per page and caches the promise so multiple
// widgets on the same view don't inject the script twice.
let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.SumUpCard) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Failed to load SumUp SDK"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function SumUpCardWidget({
  bookingId,
  checkoutId,
  amountCents,
  currency,
  locale,
  onPaid,
  onFail,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    let instance: SumUpCardInstance | null = null;
    let cancelled = false;
    (async () => {
      try {
        await loadSdk();
        if (cancelled || !window.SumUpCard || !mountRef.current) return;
        // Guard against React strict-mode double-mount re-entering here.
        if (mountedRef.current) return;
        mountedRef.current = true;
        instance = window.SumUpCard.mount({
          id: "sumup-card-widget",
          checkoutId,
          locale,
          onResponse: async (type, body) => {
            if (type === "invalid" || type === "sent" || type === "auth-screen") return;
            if (type === "success") {
              setBusy(true);
              try {
                const res = await fetch("/api/payments/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ bookingId, checkoutId }),
                });
                const data = (await res.json()) as { paid?: boolean; status?: string; error?: string };
                if (res.ok && data.paid) {
                  onPaid();
                } else {
                  const msg = data.error ?? `Payment status: ${data.status ?? "unknown"}`;
                  setError(msg);
                  onFail(msg);
                }
              } catch {
                const msg = "Could not verify the payment. Please contact us on WhatsApp.";
                setError(msg);
                onFail(msg);
              } finally {
                setBusy(false);
              }
              return;
            }
            if (type === "error" || type === "fail") {
              const b = (body ?? {}) as { message?: string };
              const msg = b.message ?? "Payment failed. Please try again or use a different card.";
              setError(msg);
              onFail(msg);
            }
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not load payment form";
        setError(msg);
        onFail(msg);
      }
    })();
    return () => {
      cancelled = true;
      try {
        instance?.unmount?.();
      } catch {
        // ignore
      }
      mountedRef.current = false;
    };
  }, [checkoutId, bookingId, locale, onPaid, onFail]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {(amountCents / 100).toFixed(2)} {currency}
      </p>
      <div id="sumup-card-widget" ref={mountRef} />
      {busy && <p className="text-xs text-muted">Confirming payment...</p>}
      {error && <p className="text-xs text-red font-medium">{error}</p>}
    </div>
  );
}
