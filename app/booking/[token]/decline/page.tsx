import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { DecisionView } from "@/app/booking/_components/decision-view";

export const dynamic = "force-dynamic";

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
    return (
      <DecisionView tone="error" message="We couldn't load this booking. Try again later." />
    );
  }

  if (!booking) {
    return (
      <DecisionView
        tone="error"
        message="This decline link is invalid or expired."
      />
    );
  }

  if (booking.status === "declined") {
    return <DecisionView tone="declined" booking={booking} alreadyDecided="declined" />;
  }

  if (booking.status !== "pending") {
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message={`This booking can no longer be declined — it is currently '${booking.status}'.`}
      />
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "declined" })
    .eq("id", booking.id)
    .select("*")
    .maybeSingle<BookingRow>();

  if (updateError || !updated) {
    console.error("[booking/decline] update error", updateError);
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message="Could not update the booking. Please try again or use the dashboard."
      />
    );
  }

  return <DecisionView tone="declined" booking={updated} />;
}
