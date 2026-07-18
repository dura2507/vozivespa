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
  // Multi-bike order: the cancel link drops the WHOLE order (the API cancels
  // every bike of the group), so the guard and the wording must cover all of
  // them, not just the row this token points at.
  let liveBikes = 1;
  let anyPickedUp = booking.picked_up_at != null;
  if (booking.booking_group_id) {
    const { data: gData, error: gErr } = await supabase
      .from("bookings")
      .select("id, status, picked_up_at")
      .eq("booking_group_id", booking.booking_group_id);
    // On error we degrade to the token-row-only guard below; the API re-checks
    // the whole group authoritatively before writing anything.
    if (gErr) console.error("[booking/cancel] group lookup", gErr);
    const cancellable = ((gData ?? []) as Array<{
      id: string;
      status: string;
      picked_up_at: string | null;
    }>).filter((r) => r.status === "pending" || r.status === "confirmed");
    if (cancellable.length > 0) {
      liveBikes = cancellable.length;
      anyPickedUp = cancellable.some((r) => r.picked_up_at != null);
    }
  }

  if (anyPickedUp) {
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
          liveBikes > 1
            ? `This cancels your entire order (${liveBikes} bikes) and releases your dates. This can't be undone here - if you're not sure, message us on WhatsApp instead.`
            : "Cancelling releases your dates. This can't be undone here - if you're not sure, message us on WhatsApp instead.",
      }}
    />
  );
}
