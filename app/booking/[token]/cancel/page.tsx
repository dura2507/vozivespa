import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { DecisionView } from "@/app/booking/_components/decision-view";

export const dynamic = "force-dynamic";

// Customer-initiated cancellation. This page ONLY reads and renders a
// confirmation button - nothing changes until the customer clicks it (a POST
// to /api/booking/[token]/decision). A GET-mutating version let mail scanners
// and link-preview bots silently cancel confirmed bookings just by fetching
// the link that sits in every confirmation email.
export default async function CancelBookingPage({
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
    console.error("[booking/cancel] lookup error", error);
    return <DecisionView tone="error" message="We couldn't load this booking. Try again later." hidePii />;
  }
  if (!booking) {
    return <DecisionView tone="error" message="This cancellation link is invalid or expired." hidePii />;
  }
  if (booking.status === "cancelled") {
    return <DecisionView tone="declined" hidePii message="This booking is already cancelled." />;
  }
  if (booking.status === "declined") {
    return <DecisionView tone="declined" hidePii message="This booking was already declined, nothing to cancel." />;
  }
  if (booking.picked_up_at) {
    return (
      <DecisionView
        tone="error"
        hidePii
        message="This rental is already picked up and can't be cancelled here. Please contact us on WhatsApp."
      />
    );
  }

  return (
    <DecisionView
      tone="prompt"
      hidePii
      confirm={{
        token,
        action: "cancel",
        intro:
          "Cancelling releases your dates. This can't be undone here - if you're not sure, message us on WhatsApp instead.",
      }}
    />
  );
}
