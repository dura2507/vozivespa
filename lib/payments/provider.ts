// Thin provider-neutral interface so the booking flow doesn't care WHICH
// PSP we use. Each adapter (SumUp, Mollie, Viva, ...) implements this same
// shape; the factory in ./index.ts picks one via the PAYMENT_PROVIDER env
// var. Lets us swap providers (or run a failover) without touching the
// booking code that calls into this.

export type CheckoutStatus = "pending" | "paid" | "failed" | "cancelled";

export type CreateCheckoutInput = {
  // The customer-visible booking number (RM-XXXXXX). We use it as the
  // PSP's checkout_reference so an incoming webhook can look the booking
  // up without any extra DB column.
  reference: string;
  amountCents: number;
  currency: string; // "EUR"
  description: string; // shows up on the customer's card statement / PSP
  customer: {
    name: string;
    email: string;
    phone?: string | null;
  };
  // Where the PSP redirects the customer's browser after the payment
  // (used by hosted checkouts / wallet flows).
  returnUrl: string;
};

export type CreateCheckoutResult = {
  // PSP-side identifier — we don't need to store it; the reference is our
  // source of truth.
  id: string;
  status: CheckoutStatus;
  // For SumUp/Mollie/etc.: the URL the customer can be redirected to, OR
  // an identifier the in-page widget initialises with. The frontend picks
  // whichever shape is non-null.
  hostedUrl?: string | null;
  widgetCheckoutId?: string | null;
};

export type WebhookEvent = {
  reference: string; // our booking number (RM-XXXXXX)
  status: CheckoutStatus;
  // Cents the PSP actually captured (may be 0 for failed/cancelled).
  amountCapturedCents: number;
  // PSP-side checkout id, for cross-reference in logs.
  providerCheckoutId: string;
};

export type CheckoutStatusResult = {
  status: CheckoutStatus;
  amountCapturedCents: number;
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  // Server-side truth check after the widget reports "success" — the SDK
  // success callback is NOT proof of payment, so we always re-read the
  // checkout from the PSP before confirming a booking.
  getCheckoutStatus(providerCheckoutId: string): Promise<CheckoutStatusResult>;
  // Verifies the webhook signature (when the PSP signs them) and parses
  // the body into our normalised event shape. Throws on invalid signature.
  parseWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookEvent>;
}
