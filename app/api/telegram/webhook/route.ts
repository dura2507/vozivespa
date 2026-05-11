import { NextResponse, after } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendCustomerBookingDecidedEmail } from "@/lib/email";
import {
  answerTelegramCallback,
  editTelegramMessageForBooking,
  parseCallbackData,
  NEW_STATUS,
} from "@/lib/telegram";
import { findFreeUnit, describeConflict } from "@/lib/availability";

export const dynamic = "force-dynamic";

// Telegram webhook entry point.
//
// Verified via the X-Telegram-Bot-Api-Secret-Token header - set when calling
// /setWebhook with a secret_token parameter. Telegram echoes that back on
// every request, anyone else gets 403.

type CallbackQuery = {
  id: string;
  data?: string;
  message?: {
    chat: { id: number };
    message_id: number;
  };
};

type Update = {
  callback_query?: CallbackQuery;
};

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (expected && provided !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cb = update.callback_query;
  if (!cb || !cb.message) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseCallbackData(cb.data);
  if (!parsed) {
    await answerTelegramCallback(cb.id, "Unknown action");
    return NextResponse.json({ ok: true });
  }

  const supabase = getServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("secret_token", parsed.secretToken)
    .maybeSingle<BookingRow>();

  if (error) {
    console.error("[telegram/webhook] booking lookup error", error);
    await answerTelegramCallback(cb.id, "Database error - try again");
    return NextResponse.json({ ok: true });
  }

  if (!booking) {
    await answerTelegramCallback(cb.id, "Booking not found");
    return NextResponse.json({ ok: true });
  }

  const newStatus = NEW_STATUS[parsed.action];

  if (booking.status === newStatus) {
    await answerTelegramCallback(cb.id, `Already ${newStatus}`);
    // Make sure the keyboard reflects current state in case it drifted.
    await editTelegramMessageForBooking(cb.message.chat.id, cb.message.message_id, booking);
    return NextResponse.json({ ok: true });
  }

  const wasFromPending = booking.status === "pending";

  // Re-check availability before flipping to confirmed. A second
  // pending booking could have been created while this one was awaiting
  // approval, or the owner might have added a manual block in Supabase
  // Studio. With multi-unit, this also locks in the actual free unit
  // at confirm-time . the unit assigned at insert may have been taken
  // by another customer in the meantime.
  let assignedUnitId: string | null = booking.bike_unit_id;
  if (newStatus === "confirmed") {
    try {
      const availability = await findFreeUnit(supabase, {
        bikeId: booking.bike_id,
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        pickupTime: booking.pickup_time,
        returnTime: booking.return_time,
        excludeBookingId: booking.id,
      });
      if (!availability.unitId) {
        await answerTelegramCallback(
          cb.id,
          `Conflict . ${availability.conflict ? describeConflict(availability.conflict) : "no free unit"}`,
        );
        return NextResponse.json({ ok: true });
      }
      assignedUnitId = availability.unitId;
    } catch (err) {
      console.error("[telegram/webhook] availability check error", err);
      await answerTelegramCallback(cb.id, "Database error - try again");
      return NextResponse.json({ ok: true });
    }
  }

  const patch: Partial<BookingRow> = {
    status: newStatus,
    decided_at: new Date().toISOString(),
  };
  if (newStatus === "confirmed") patch.bike_unit_id = assignedUnitId;

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", booking.id)
    .select("*")
    .maybeSingle<BookingRow>();

  if (updateError || !updated) {
    console.error("[telegram/webhook] update error", updateError);
    await answerTelegramCallback(cb.id, "Update failed - try again");
    return NextResponse.json({ ok: true });
  }

  // Toast immediately so Telegram stops spinning on the user's button.
  const toast =
    newStatus === "confirmed"
      ? wasFromPending
        ? "✓ Booking confirmed"
        : "✓ Re-confirmed - dates blocked again"
      : wasFromPending
        ? "✗ Booking declined"
        : "✗ Declined - dates released";
  await answerTelegramCallback(cb.id, toast);

  // Heavy work after the response - Vercel keeps the function alive for these.
  after(async () => {
    await editTelegramMessageForBooking(
      cb.message!.chat.id,
      cb.message!.message_id,
      updated,
    );
    if (wasFromPending) {
      await sendCustomerBookingDecidedEmail(updated, newStatus);
    }
  });

  return NextResponse.json({ ok: true });
}
