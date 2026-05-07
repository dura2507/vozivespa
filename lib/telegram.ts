import { CATEGORIES } from "@/lib/mockData";
import type { BookingRow } from "@/lib/supabase";

const TG_API = "https://api.telegram.org";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function nightsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function escapeMd(s: string): string {
  // Telegram MarkdownV2 reserved chars
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Send the owner the new-booking notification on Telegram with inline
 * Confirm / Decline buttons. Best-effort: errors are logged, never thrown.
 */
export async function sendOwnerBookingTelegram(booking: BookingRow): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID?.trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — skipping owner notification");
    return;
  }
  if (!chatId) {
    console.warn("[telegram] TELEGRAM_OWNER_CHAT_ID not set — skipping owner notification");
    return;
  }

  const bike = CATEGORIES.find((c) => c.id === booking.bike_id);
  const bikeName = bike?.model ?? booking.bike_id;
  const nights = nightsBetween(booking.date_from, booking.date_to);
  const total = booking.total_price_cents
    ? `${(booking.total_price_cents / 100).toFixed(0)}€`
    : "—";
  const tokenPath = encodeURIComponent(booking.secret_token);
  const confirmUrl = `${siteUrl}/booking/${tokenPath}/confirm`;
  const declineUrl = `${siteUrl}/booking/${tokenPath}/decline`;
  const phoneDigits = booking.customer_phone.replace(/[^\d]/g, "");
  const waUrl = `https://wa.me/${phoneDigits}`;

  // Telegram inline-keyboard URL buttons require HTTPS — fall back to plain
  // links in the message body when running on localhost (dev).
  const httpsOnly = siteUrl.startsWith("https://");

  // MarkdownV2 — escape all dynamic strings
  const lines = [
    "🛵 *New booking request*",
    "",
    `*Bike:* ${escapeMd(bikeName)}`,
    `*Dates:* ${escapeMd(fmtDate(booking.date_from))} → ${escapeMd(fmtDate(booking.date_to))} \\(${nights} ${nights === 1 ? "day" : "days"}\\)`,
    `*Total:* ${escapeMd(total)}`,
    "",
    `*Name:* ${escapeMd(booking.customer_name)}`,
    `*Phone:* ${escapeMd(booking.customer_phone)}`,
    `*Email:* ${escapeMd(booking.customer_email)}`,
  ];
  if (booking.notes) {
    lines.push(`*Notes:* ${escapeMd(booking.notes)}`);
  }
  if (!httpsOnly) {
    lines.push(
      "",
      `Confirm: ${escapeMd(confirmUrl)}`,
      `Decline: ${escapeMd(declineUrl)}`,
      `WhatsApp: ${escapeMd(waUrl)}`,
    );
  }

  type InlineKeyboardButton = { text: string; url: string };
  type ReplyMarkup = { inline_keyboard: InlineKeyboardButton[][] };
  const body: {
    chat_id: string;
    text: string;
    parse_mode: string;
    reply_markup?: ReplyMarkup;
  } = {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "MarkdownV2",
  };

  if (httpsOnly) {
    body.reply_markup = {
      inline_keyboard: [
        [
          { text: "✓ Confirm", url: confirmUrl },
          { text: "✗ Decline", url: declineUrl },
        ],
        [{ text: "💬 WhatsApp Customer", url: waUrl }],
      ],
    };
  }

  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[telegram] sendMessage failed", res.status, text);
    }
  } catch (err) {
    console.error("[telegram] sendOwnerBookingTelegram failed", err);
  }
}
