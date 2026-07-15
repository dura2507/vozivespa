import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { DecisionView } from "@/app/booking/_components/decision-view";

export const dynamic = "force-dynamic";

// Owner decline link. Reads only and renders a decline button; the state
// change happens on click via /api/booking/[token]/decision.
export default async function DeclineBookingPage({
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
    console.error("[booking/decline] lookup error", error);
    return <DecisionView tone="error" message="We couldn't load this booking. Try again later." />;
  }
  if (!booking) {
    return <DecisionView tone="error" message="This decline link is invalid or expired." />;
  }
  if (booking.status === "declined") {
    return <DecisionView tone="declined" booking={booking} alreadyDecided="declined" />;
  }
  if (booking.status !== "pending") {
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message={`This booking can no longer be declined, it is currently '${booking.status}'.`}
      />
    );
  }

  return (
    <DecisionView
      tone="prompt"
      booking={booking}
      confirm={{ token, action: "decline", intro: "Decline this booking? The dates stay open on the website." }}
    />
  );
}
