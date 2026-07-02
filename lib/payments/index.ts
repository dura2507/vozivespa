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

// Whether online card payment is live. The SumUp widget only needs the
// server-created checkout id (no public key), so the client just needs to
// know which flow to render: the online card widget, or the manual
// screenshot upload. Passed from server components into the booking UI.
export function onlinePaymentEnabled(): boolean {
  return (process.env.PAYMENT_PROVIDER ?? "manual").toLowerCase() === "sumup";
}
