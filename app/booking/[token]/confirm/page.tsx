import { after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendCustomerBookingDecidedEmail } from "@/lib/email";
import { DecisionView } from "@/app/booking/_components/decision-view";

export const dynamic = "force-dynamic";

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
    return (
      <DecisionView tone="error" message="We couldn't load this booking. Try again later." />
    );
  }

  if (!booking) {
    return (
      <DecisionView
        tone="error"
        message="This confirmation link is invalid or expired."
      />
    );
  }

  if (booking.status === "confirmed") {
    return <DecisionView tone="confirmed" booking={booking} alreadyDecided="confirmed" />;
  }

  if (booking.status !== "pending") {
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message={`This booking can no longer be confirmed - it is currently '${booking.status}'.`}
      />
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", booking.id)
    .select("*")
    .maybeSingle<BookingRow>();

  if (updateError || !updated) {
    console.error("[booking/confirm] update error", updateError);
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message="Could not update the booking. Please try again or use the dashboard."
      />
    );
  }

  // Notify customer after the page renders so it doesn't slow the owner.
  after(async () => {
    await sendCustomerBookingDecidedEmail(updated, "confirmed");
  });

  return <DecisionView tone="confirmed" booking={updated} />;
}
