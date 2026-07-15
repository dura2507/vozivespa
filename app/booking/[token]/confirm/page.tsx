import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { DecisionView } from "@/app/booking/_components/decision-view";

export const dynamic = "force-dynamic";

// Owner confirm link. Reads only and renders a confirm button; the capacity
// re-check + state change happen on click via /api/booking/[token]/decision,
// so a prefetch of the link can't confirm anything.
export default async function ConfirmBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getServiceClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("secret_token", token)
    .maybeSingle<BookingRow>();

  if (error) {
    console.error("[booking/confirm] lookup error", error);
    return <DecisionView tone="error" message="We couldn't load this booking. Try again later." />;
  }
  if (!booking) {
    return <DecisionView tone="error" message="This confirmation link is invalid or expired." />;
  }
  if (booking.status === "confirmed") {
    return <DecisionView tone="confirmed" booking={booking} alreadyDecided="confirmed" />;
  }
  if (booking.status !== "pending") {
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message={`This booking can no longer be confirmed, it is currently '${booking.status}'.`}
      />
    );
  }

  return (
    <DecisionView
      tone="prompt"
      booking={booking}
      confirm={{ token, action: "confirm", intro: "Confirm this booking? The dates will be blocked on the website." }}
    />
  );
}
