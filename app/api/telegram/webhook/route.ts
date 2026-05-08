import { NextResponse } from "next/server";
import { getServiceClient, type BookingRow } from "@/lib/supabase";
import { sendCustomerBookingDecidedEmail } from "@/lib/email";
import {
  answerTelegramCallback,
  editTelegramMessageForBooking,
  parseCallbackData,
  NEW_STATUS,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Telegram webhook entry point.
//
// Verified via the X-Telegram-Bot-Api-Secret-Token header — set when calling
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
    await answerTelegramCallback(cb.id, "Database error — try again");
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

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", booking.id)
    .select("*")
    .maybeSingle<BookingRow>();

  if (updateError || !updated) {
    console.error("[telegram/webhook] update error", updateError);
    await answerTelegramCallback(cb.id, "Update failed — try again");
    return NextResponse.json({ ok: true });
  }

  // Customer email — only on the first decision out of pending (toggles
  // afterwards are usually corrections; don't spam the customer).
  if (wasFromPending) {
    sendCustomerBookingDecidedEmail(updated, newStatus).catch((err) =>
      console.error("[telegram/webhook] customer email failed", err),
    );
  }

  // Update the original Telegram message with the new state + keyboard.
  await editTelegramMessageForBooking(cb.message.chat.id, cb.message.message_id, updated);

  // Toast in Telegram client.
  const toast =
    newStatus === "confirmed"
      ? wasFromPending
        ? "✓ Booking confirmed"
        : "✓ Re-confirmed — dates blocked again"
      : wasFromPending
        ? "✗ Booking declined"
        : "✗ Declined — dates released";
  await answerTelegramCallback(cb.id, toast);

  return NextResponse.json({ ok: true });
}
