import { CATEGORIES } from "@/lib/mockData";
import { retry } from "@/lib/retry";
import type { BookingRow } from "@/lib/supabase";

const TG_API = "https://api.telegram.org";

async function callTelegram(method: string, body: Record<string, unknown>): Promise<void> {
  const tok = token();
  if (!tok) throw new Error("TELEGRAM_BOT_TOKEN not set");

  await retry(`tg:${method}`, async () => {
    const res = await fetch(`${TG_API}/bot${tok}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`telegram ${method} ${res.status}: ${text}`);
    }
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

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
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
    : "—";
}

// ----- Inline keyboard builder ---------------------------------------------

type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

type InlineKeyboard = InlineKeyboardButton[][];

function statusBanner(booking: BookingRow): string {
  switch (booking.status) {
    case "confirmed":
      return `\n\n✅ *Confirmed*${booking.decided_at ? ` at ${escapeMd(fmtTime(booking.decided_at))}` : ""}`;
    case "declined":
      return `\n\n❌ *Declined*${booking.decided_at ? ` at ${escapeMd(fmtTime(booking.decided_at))}` : ""}`;
    case "cancelled":
      return `\n\n🚫 *Cancelled*`;
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
  if (phoneDigits) rows.push([{ text: "💬 WhatsApp Customer", url: waUrl }]);
  return rows;
}

function buildText(booking: BookingRow): string {
  const bikeName = bikeNameFor(booking);
  const nights = nightsBetween(booking.date_from, booking.date_to);

  const lines = [
    "🛵 *New booking request*",
    "",
    `*Bike:* ${escapeMd(bikeName)}`,
    `*Dates:* ${escapeMd(fmtDate(booking.date_from))} → ${escapeMd(fmtDate(booking.date_to))} \\(${nights} ${nights === 1 ? "day" : "days"}\\)`,
    `*Total:* ${escapeMd(totalEur(booking))}`,
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

export async function sendOwnerBookingTelegram(booking: BookingRow): Promise<void> {
  const chatId = ownerChatId();
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_OWNER_CHAT_ID not set — skipping owner notification");
    return;
  }
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: buildText(booking),
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: buildKeyboard(booking) },
  });
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
