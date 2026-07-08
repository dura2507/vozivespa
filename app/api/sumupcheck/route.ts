import { NextResponse } from "next/server";
import { sumupProvider } from "@/lib/payments/sumup";

// TEMPORARY diagnostic: probes whether SumUp has activated the "payments"
// scope / Checkouts API for the account yet. Calls createCheckout server-side
// with a throwaway reference (no booking is created, no card, no money moves —
// a checkout object just expires unpaid). Token-gated so randoms can't spam it.
// Remove once online payment is confirmed live.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "krileo-probe-9f3a";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("t") !== TOKEN) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const r = await sumupProvider.createCheckout({
      reference: `probe-${Date.now()}`,
      amountCents: 100,
      currency: "EUR",
      description: "activation probe",
      customer: { name: "Probe", email: "", phone: "" },
      returnUrl: "https://rentamotozadar.com/",
    });
    return NextResponse.json({ activated: true, checkoutId: r.id, status: r.status });
  } catch (err) {
    return NextResponse.json({
      activated: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
