import type { PaymentProvider } from "./provider";
import { sumupProvider } from "./sumup";

export type { PaymentProvider, CreateCheckoutInput, WebhookEvent, CheckoutStatus } from "./provider";

// Picks the active PSP from PAYMENT_PROVIDER. Default "manual" = the
// current screenshot-upload flow (no online charge). Setting "sumup" in
// Vercel switches the booking flow over without code changes. Add new
// adapters here as they're built (Mollie / Viva / Stripe).
export function paymentProvider(): PaymentProvider | null {
  const v = (process.env.PAYMENT_PROVIDER ?? "manual").toLowerCase();
  if (v === "sumup") return sumupProvider;
  // "manual" or unknown: the screenshot-upload flow handles payment, so
  // the booking code skips the provider entirely (callers should null-check).
  return null;
}

// Public-key + merchant info the frontend widget needs. Surfaced via a
// server component / API so we never hardcode it in client code.
export function publicPaymentConfig() {
  const provider = (process.env.PAYMENT_PROVIDER ?? "manual").toLowerCase();
  if (provider === "sumup") {
    return {
      provider: "sumup" as const,
      publicKey: process.env.NEXT_PUBLIC_SUMUP_PUBLIC_KEY ?? "",
    };
  }
  return { provider: "manual" as const };
}
