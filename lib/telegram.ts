import { CATEGORIES } from "@/lib/mockData";
import { retry } from "@/lib/retry";
import type { BookingRow } from "@/lib/supabase";

const TG_API = "https://api.telegram.org";

type TelegramResponse<T = unknown> = { ok: boolean; result?: T };

async function callTelegram<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
  const tok = token();
  if (!tok) throw new Error("TELEGRAM_BOT_TOKEN not set");

  return await retry(`tg:${method}`, async () => {
    const res = await fetch(`${TG_API}/bot${tok}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`telegram ${method} ${res.status}: ${text}`);
    }
    return (await res.json()) as TelegramResponse<T>;
  });
}

// ----- Helpers --------------------------------------------------------------

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

function ownerChatId(): string | null {
  return process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || null;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Render a timestamptz in the owner's local timezone (Zadar, Croatia).
// Vercel functions run in UTC otherwise, which would show times shifted
// by 1–2 hours depending on DST.
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Postgres `time` comes back as 'HH:MM:SS' — drop seconds for display.
function fmtTimeOfDay(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function nightsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function escapeMd(s: string): string {
  // MarkdownV2 reserved chars
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function bikeNameFor(booking: BookingRow): string {
  const bike = CATEGORIES.find((c) => c.id === booking.bike_id);
  return bike?.model ?? booking.bike_id;
}

function totalEur(booking: BookingRow): string {
  return booking.total_price_cents
    ? `${(booking.total_price_cents / 100).toFixed(0)}€`
    : "-";
}

function paymentLabel(id: BookingRow["payment_method"]): string {
  if (!id) return "-";
  return (
    {
      paypal_ff: "PayPal · Friends & Family",
      paypal_company: "PayPal · Company",
      bank: "Bank Transfer (SEPA)",
    } as const
  )[id];
}

// Telegram sendPhoto only handles JPEG/PNG/WebP reliably. Anything else
// (HEIC, PDF) goes via sendDocument so the file at least lands.
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// ----- Inline keyboard builder ---------------------------------------------

type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

type InlineKeyboard = InlineKeyboardButton[][];

function statusBanner(booking: BookingRow): string {
  const decidedAt = booking.decided_at ? ` · ${escapeMd(fmtDateTime(booking.decided_at))}` : "";
  switch (booking.status) {
    case "confirmed":
      return `\n\n*Confirmed*${decidedAt}`;
    case "declined":
      return `\n\n*Declined*${decidedAt}`;
    case "cancelled":
      return `\n\n*Cancelled*${decidedAt}`;
    default:
      return "";
  }
}

function buildKeyboard(booking: BookingRow): InlineKeyboard {
  const phoneDigits = booking.customer_phone.replace(/[^\d]/g, "");
  const waUrl = `https://wa.me/${phoneDigits}`;

  // Button labels adapt to current status so it's obvious what each click does:
  //   pending   → [Confirm] [Decline]
  //   confirmed → [Release dates] (un-confirm, frees the calendar)
  //   declined  → [Confirm anyway]
  const row1: InlineKeyboardButton[] = [];
  if (booking.status === "pending") {
    row1.push({ text: "✓ Confirm", callback_data: `confirm:${booking.secret_token}` });
    row1.push({ text: "✗ Decline", callback_data: `decline:${booking.secret_token}` });
  } else if (booking.status === "confirmed") {
    row1.push({ text: "↻ Release dates", callback_data: `decline:${booking.secret_token}` });
  } else if (booking.status === "declined") {
    row1.push({ text: "✓ Confirm anyway", callback_data: `confirm:${booking.secret_token}` });
  }

  const rows: InlineKeyboard = [];
  if (row1.length > 0) rows.push(row1);
  if (phoneDigits) rows.push([{ text: "WhatsApp Customer", url: waUrl }]);
  return rows;
}

function buildText(booking: BookingRow, unitLabel?: string | null): string {
  const bikeName = bikeNameFor(booking);
  const nights = nightsBetween(booking.date_from, booking.date_to);
  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);

  const bikeLine = unitLabel
    ? `*Bike:* ${escapeMd(bikeName)} \\(${escapeMd(unitLabel)}\\)`
    : `*Bike:* ${escapeMd(bikeName)}`;

  const lines = [
    "*New booking request*",
    "",
    bikeLine,
    `*Pickup:* ${escapeMd(fmtDate(booking.date_from))}${pickup ? ` ${escapeMd(pickup)}` : ""}`,
    `*Return:* ${escapeMd(fmtDate(booking.date_to))}${ret ? ` ${escapeMd(ret)}` : ""} \\(${nights} ${nights === 1 ? "day" : "days"}\\)`,
    `*Total:* ${escapeMd(totalEur(booking))}`,
    `*Deposit via:* ${escapeMd(paymentLabel(booking.payment_method))}`,
    "",
    `*Name:* ${escapeMd(booking.customer_name)}`,
    `*Phone:* ${escapeMd(booking.customer_phone)}`,
    `*Email:* ${escapeMd(booking.customer_email)}`,
  ];
  if (booking.notes) {
    lines.push(`*Notes:* ${escapeMd(booking.notes)}`);
  }
  return lines.join("\n") + statusBanner(booking);
}

// ----- Public API: send / edit / answer ------------------------------------

export async function sendOwnerBookingTelegram(
  booking: BookingRow,
  receipt?: { url: string; mime: string },
  unitLabel?: string | null,
): Promise<void> {
  const chatId = ownerChatId();
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_OWNER_CHAT_ID not set - skipping owner notification");
    return;
  }

  // Booking message first so the Confirm / Decline buttons land
  // before the receipt. Receipt then arrives as a reply to the
  // booking message — Telegram renders that as a quoted thread, so
  // it's clearly the deposit attachment for this booking and not a
  // free-standing photo.
  const msgRes = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: buildText(booking, unitLabel),
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: buildKeyboard(booking) },
  });
  const replyToId = msgRes.result?.message_id;

  if (receipt?.url) {
    const isPhoto = PHOTO_MIMES.has(receipt.mime);
    const caption = `Deposit receipt · ${escapeMd(bikeNameFor(booking))} · ${escapeMd(booking.customer_name)}`;
    await callTelegram(isPhoto ? "sendPhoto" : "sendDocument", {
      chat_id: chatId,
      [isPhoto ? "photo" : "document"]: receipt.url,
      caption,
      parse_mode: "MarkdownV2",
      ...(replyToId ? { reply_to_message_id: replyToId } : {}),
    });
  }
}

export async function editTelegramMessageForBooking(
  chatId: number | string,
  messageId: number,
  booking: BookingRow,
): Promise<void> {
  await callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: buildText(booking),
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: buildKeyboard(booking) },
  });
}

export async function answerTelegramCallback(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  await callTelegram("answerCallbackQuery", body);
}

/**
 * Generic contact-form submission notification to the owner.
 */
export async function sendOwnerContactMessage(input: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}): Promise<void> {
  const chatId = ownerChatId();
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_OWNER_CHAT_ID not set - skipping contact notification");
    return;
  }

  const lines = [
    "*New contact message*",
    "",
    `*From:* ${escapeMd(input.name)}`,
    `*Email:* \`${escapeMd(input.email)}\``,
  ];
  if (input.phone) {
    lines.push(`*Phone:* \`${escapeMd(input.phone)}\``);
  }
  lines.push("", escapeMd(input.message), "", "_Reply to the email I just sent you to answer this message\\._");

  type InlineKeyboardButton = { text: string; url: string };
  const phoneDigits = input.phone ? input.phone.replace(/[^\d]/g, "") : "";
  const buttons: InlineKeyboardButton[] = [];
  if (phoneDigits) {
    buttons.push({ text: "WhatsApp", url: `https://wa.me/${phoneDigits}` });
  }

  // No mailto: button — Telegram inline-keyboard URLs must be http(s) only,
  // so we put the email inside a code-span (tap to copy) and tell the owner
  // to reply to the parallel email.
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "MarkdownV2",
    ...(buttons.length > 0
      ? { reply_markup: { inline_keyboard: [buttons] } }
      : {}),
  });
}

/**
 * Standalone heads-up to the owner when the customer cancels themselves
 * via the link in the confirmation email. The original booking message
 * may already be far up the chat, so we send a fresh one.
 */
export async function sendOwnerCancellationTelegram(booking: BookingRow): Promise<void> {
  const chatId = ownerChatId();
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_OWNER_CHAT_ID not set - skipping cancellation notification");
    return;
  }

  const bikeName = bikeNameFor(booking);
  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);
  const lines = [
    "*Customer cancelled*",
    "",
    `*Bike:* ${escapeMd(bikeName)}`,
    `*Pickup:* ${escapeMd(fmtDate(booking.date_from))}${pickup ? ` ${escapeMd(pickup)}` : ""}`,
    `*Return:* ${escapeMd(fmtDate(booking.date_to))}${ret ? ` ${escapeMd(ret)}` : ""}`,
    `*Name:* ${escapeMd(booking.customer_name)}`,
    `*Phone:* ${escapeMd(booking.customer_phone)}`,
    "",
    "_Dates are released - calendar updated automatically\\._",
  ];

  const phoneDigits = booking.customer_phone.replace(/[^\d]/g, "");
  const reply_markup = phoneDigits
    ? {
        inline_keyboard: [
          [{ text: "WhatsApp Customer", url: `https://wa.me/${phoneDigits}` }],
        ],
      }
    : undefined;

  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "MarkdownV2",
    ...(reply_markup ? { reply_markup } : {}),
  });
}

export type CallbackAction = "confirm" | "decline";

export function parseCallbackData(
  data: string | undefined,
): { action: CallbackAction; secretToken: string } | null {
  if (!data) return null;
  const idx = data.indexOf(":");
  if (idx < 0) return null;
  const action = data.slice(0, idx);
  const secretToken = data.slice(idx + 1);
  if ((action !== "confirm" && action !== "decline") || !secretToken) return null;
  return { action, secretToken };
}

export const NEW_STATUS: Record<CallbackAction, "confirmed" | "declined"> = {
  confirm: "confirmed",
  decline: "declined",
};
