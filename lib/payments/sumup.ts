import type {
  PaymentProvider,
  CreateCheckoutInput,
  CreateCheckoutResult,
  WebhookEvent,
  CheckoutStatus,
} from "./provider";

// Spec the API lives at: https://developer.sumup.com/online-payments
// We use the hosted-checkout flow: server creates a checkout, the public
// JS SDK (with the public key) renders the widget on our page, SumUp
// posts the result to our webhook URL.
const BASE = "https://api.sumup.com";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function mapStatus(s: string | undefined): CheckoutStatus {
  // SumUp uses PAID / PENDING / FAILED / EXPIRED (uppercase per docs).
  switch ((s ?? "").toUpperCase()) {
    case "PAID":
      return "paid";
    case "FAILED":
    case "EXPIRED":
      return "failed";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    default:
      return "pending";
  }
}

export const sumupProvider: PaymentProvider = {
  name: "sumup",

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const secret = env("SUMUP_SECRET_KEY");
    const merchant = env("SUMUP_MERCHANT_CODE");
    // SumUp expects euros as a decimal number (e.g. 12.50), not cents.
    const amount = (input.amountCents / 100).toFixed(2);

    const res = await fetch(`${BASE}/v0.1/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkout_reference: input.reference,
        amount: Number(amount),
        currency: input.currency,
        merchant_code: merchant,
        description: input.description,
        return_url: input.returnUrl,
        // redirect_url is what the SumUp widget needs for APMs (Apple
        // Pay, PayPal, ...) so we set it to the same return URL.
        redirect_url: input.returnUrl,
        customer_email: input.customer.email || undefined,
      }),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err = (data as { message?: string; error_message?: string }) ?? {};
      throw new Error(
        `SumUp createCheckout ${res.status}: ${err.message ?? err.error_message ?? text.slice(0, 200)}`,
      );
    }
    const d = data as { id?: string; status?: string };
    if (!d.id) throw new Error("SumUp createCheckout: no checkout id in response");
    return {
      id: d.id,
      status: mapStatus(d.status),
      // SumUp doesn't return a single hostedUrl; the widget hydrates from
      // the checkout id on the client. We return the id under the widget
      // slot — the frontend reads NEXT_PUBLIC_SUMUP_PUBLIC_KEY and boots
      // the SDK with it.
      hostedUrl: null,
      widgetCheckoutId: d.id,
    };
  },

  async parseWebhook(rawBody: string): Promise<WebhookEvent> {
    // SumUp's webhook payload is the checkout object itself. They don't
    // sign requests; the URL secret is what protects us (we put a random
    // token in the env and require it in the path / query string when
    // SumUp registers the webhook). The route handler enforces that.
    let body: {
      id?: string;
      checkout_reference?: string;
      status?: string;
      amount?: number | string;
      currency?: string;
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new Error("SumUp webhook: invalid JSON");
    }
    if (!body.checkout_reference) {
      throw new Error("SumUp webhook: missing checkout_reference");
    }
    const amount = typeof body.amount === "string" ? Number(body.amount) : body.amount ?? 0;
    return {
      reference: body.checkout_reference,
      status: mapStatus(body.status),
      // amount comes as euros (e.g. 12.50) — convert to cents.
      amountCapturedCents: Math.round(amount * 100),
      providerCheckoutId: body.id ?? "",
    };
  },
};
