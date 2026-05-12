import { after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendOwnerCancellationTelegram } from "@/lib/telegram";
import { sendOwnerCancellationEmail } from "@/lib/email";
import { DecisionView } from "@/app/booking/_components/decision-view";

export const dynamic = "force-dynamic";

// Customer-initiated cancellation. Linked from the confirmation email so a
// customer can free up the dates without writing a message. The DB trigger
// removes the matching blocked_dates row when status leaves 'confirmed'.
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
    return (
      <DecisionView tone="error" message="We couldn't load this booking. Try again later." />
    );
  }

  if (!booking) {
    return (
      <DecisionView tone="error" message="This cancellation link is invalid or expired." />
    );
  }

  if (booking.status === "cancelled") {
    return <DecisionView tone="declined" booking={booking} alreadyDecided="cancelled" />;
  }

  if (booking.status === "declined") {
    return (
      <DecisionView
        tone="declined"
        booking={booking}
        message="This booking was already declined - nothing to cancel."
      />
    );
  }

  // Allow cancelling pending or confirmed bookings.
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", booking.id)
    .select("*")
    .maybeSingle<BookingRow>();

  if (updateError || !updated) {
    console.error("[booking/cancel] update error", updateError);
    return (
      <DecisionView
        tone="error"
        booking={booking}
        message="Could not cancel this booking. Please reach out to us on WhatsApp."
      />
    );
  }

  // Tell the owner via both channels - best effort, runs after response.
  after(async () => {
    await Promise.allSettled([
      sendOwnerCancellationTelegram(updated),
      sendOwnerCancellationEmail(updated, "customer"),
    ]);
  });

  return (
    <DecisionView
      tone="declined"
      booking={updated}
      message="Your booking is cancelled and the dates are released. Sorry to see you go - drop us a line on WhatsApp anytime if plans change."
    />
  );
}
