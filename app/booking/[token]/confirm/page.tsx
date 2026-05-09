import { after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendCustomerBookingDecidedEmail } from "@/lib/email";
import { DecisionView } from "@/app/booking/_components/decision-view";
import { findOverlap, describeConflict } from "@/lib/availability";

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

  try {
    const conflict = await findOverlap(supabase, {
      bikeId: booking.bike_id,
      dateFrom: booking.date_from,
      dateTo: booking.date_to,
      pickupTime: booking.pickup_time,
      returnTime: booking.return_time,
      excludeBookingId: booking.id,
    });
    if (conflict) {
      return (
        <DecisionView
          tone="error"
          booking={booking}
          message={`Cannot confirm - conflict with ${describeConflict(conflict)}. Decline this one or reschedule the other.`}
        />
      );
    }
  } catch (err) {
    console.error("[booking/confirm] conflict check error", err);
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message="Could not verify availability. Please try again."
      />
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "confirmed", decided_at: new Date().toISOString() })
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
