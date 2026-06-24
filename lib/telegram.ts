import { CATEGORIES } from "@/lib/mockData";
import { retry } from "@/lib/retry";
import { billableDays } from "@/lib/pricing";
import type { BookingRow } from "@/lib/supabase";
import { translate, needsTranslationForOwner } from "@/lib/translate";

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
  // Backwards-compatible primary: when multiple IDs are configured we
  // return the first one so existing callers that only send to "the
  // owner" still work. Use ownerChatIds() to fan out to everyone.
  return ownerChatIds()[0] ?? null;
}

// Comma-separated list in TELEGRAM_OWNER_CHAT_ID lets us notify
// multiple people (e.g. owner + partner). Whitespace and empty
// entries are stripped so "1234, 5678,, 9012" works.
function ownerChatIds(): string[] {
  const raw = process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// The "Rent Amoto" supergroup with topics. Bookings go to the "Booking
// Requests" topic, contact-form messages to the "Contact form" topic.
// Kept here (not secret) so the routing is explicit. The old per-person
// DM chat IDs in TELEGRAM_OWNER_CHAT_ID still get a copy during the
// transition — clear that env var to drop them once the group is proven.
const GROUP_CHAT_ID = "-1004305871084";
const TOPIC_BOOKINGS = 2;
const TOPIC_CONTACT = 3;

type NotifyTarget = { chatId: string; threadId?: number };

function bookingTargets(): NotifyTarget[] {
  return [
    ...ownerChatIds().map((chatId) => ({ chatId }) as NotifyTarget),
    { chatId: GROUP_CHAT_ID, threadId: TOPIC_BOOKINGS },
  ];
}

function contactTargets(): NotifyTarget[] {
  return [
    ...ownerChatIds().map((chatId) => ({ chatId }) as NotifyTarget),
    { chatId: GROUP_CHAT_ID, threadId: TOPIC_CONTACT },
  ];
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Render a timestamptz in the owner's local timezone (Zadar, Croatia).
// Vercel functions run in UTC otherwise, which would show times shifted
// by 1-2 hours depending on DST.
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

// Postgres `time` comes back as 'HH:MM:SS' . drop seconds for display.
function fmtTimeOfDay(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

// Days the customer is being CHARGED for — uses billableDays
// (24h blocks with the 15-min grace) instead of the old calendar-
// day diff. Otherwise a 09:00→19:00 next-day rental would show
// "1 day" while the invoice already counted 2.
function bookingDays(b: BookingRow): number {
  return billableDays(
    new Date(`${b.date_from}T00:00:00`),
    new Date(`${b.date_to}T00:00:00`),
    b.pickup_time?.slice(0, 5) ?? "09:00",
    b.return_time?.slice(0, 5) ?? "19:00",
  );
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

// 20% of the total — what the customer just paid as the booking fee
// (deposit screenshot landing on the next line is the proof of this).
// Returns null when we have no total to derive it from.
function bookingFeeEur(booking: BookingRow): string | null {
  if (!booking.total_price_cents) return null;
  return `${Math.round(booking.total_price_cents * 0.2 / 100)}€`;
}

// The DB `notes` column holds "Licence country: X" prepended to the
// customer's free-text note. Split them back out so the Telegram
// message can show them as two distinct fields instead of one
// mashed-up block.
function splitNotes(raw: string | null): { country: string | null; note: string | null } {
  if (!raw) return { country: null, note: null };
  const m = raw.match(/^Licence country:\s*([^\n]+)(?:\n+([\s\S]*))?$/);
  if (!m) return { country: null, note: raw.trim() || null };
  return {
    country: m[1].trim(),
    note: m[2]?.trim() || null,
  };
}

function paymentLabel(id: BookingRow["payment_method"]): string {
  if (!id) return "-";
  return (
    {
      paypal_ff: "PayPal · Friends & Family",
      paypal_company: "PayPal · Company",
      bank: "Bank Transfer (SEPA)",
      revolut: "Revolut",
    } as const
  )[id];
}

function ridingStyleLabel(s: BookingRow["riding_style"]): string {
  if (s === "solo") return "Solo";
  if (s === "with_passenger") return "With passenger";
  return "-";
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
  // We used to append fmtDateTime(decided_at) here, but the timestamp
  // confused the owner more than it helped, and validating that it
  // always renders in Europe/Zagreb across DST switches added noise.
  // The status word alone is enough since the message itself updates
  // in place the moment the owner taps Confirm / Decline.
  switch (booking.status) {
    case "confirmed":
      return `\n\n*Confirmed*`;
    case "declined":
      return `\n\n*Declined*`;
    case "cancelled":
      return `\n\n*Cancelled*`;
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

function buildText(
  booking: BookingRow,
  unitLabel?: string | null,
  translatedNote?: string | null,
): string {
  const bikeName = bikeNameFor(booking);
  const nights = bookingDays(booking);
  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);

  const bikeLine = unitLabel
    ? `*Bike:* ${escapeMd(bikeName)} \\(${escapeMd(unitLabel)}\\)`
    : `*Bike:* ${escapeMd(bikeName)}`;

  const fee = bookingFeeEur(booking);
  const { country: licenceCountry, note: cleanNote } = splitNotes(booking.notes);

  const lines = [
    "*New booking request*",
    "",
    bikeLine,
    `*Pickup:* ${escapeMd(fmtDate(booking.date_from))}${pickup ? ` ${escapeMd(pickup)}` : ""}`,
    `*Return:* ${escapeMd(fmtDate(booking.date_to))}${ret ? ` ${escapeMd(ret)}` : ""} \\(${nights} ${nights === 1 ? "day" : "days"}\\)`,
    `*Total:* ${escapeMd(totalEur(booking))}`,
    fee ? `*Booking fee:* ${escapeMd(fee)} \\(20%\\)` : null,
    `*Paid via:* ${escapeMd(paymentLabel(booking.payment_method))}`,
    "",
    `*Name:* ${escapeMd(booking.customer_name)}`,
    `*Phone:* ${escapeMd(booking.customer_phone)}`,
    `*Email:* ${escapeMd(booking.customer_email)}`,
    `*Licence:* ${escapeMd(booking.drivers_licence ?? "-")}`,
    licenceCountry ? `*Licence country:* ${escapeMd(licenceCountry)}` : null,
    `*Riding:* ${escapeMd(ridingStyleLabel(booking.riding_style))}`,
    cleanNote ? `*Notes:* ${escapeMd(cleanNote)}` : null,
    // English translation set clearly apart from the original note with
    // a blank line + flag header, so it doesn't read as one block.
    translatedNote
      ? `\n🇬🇧 *English translation*\n${escapeMd(translatedNote)}`
      : null,
  ].filter((l): l is string => l !== null);

  return lines.join("\n") + statusBanner(booking);
}

// ----- Public API: send / edit / answer ------------------------------------

export async function sendOwnerBookingTelegram(
  booking: BookingRow,
  receipt?: { url: string; mime: string },
  unitLabel?: string | null,
): Promise<Array<{ chatId: string; messageId: number }>> {
  const targets = bookingTargets();

  // Translate the customer's note into English whenever it isn't already
  // English (German included). Best-effort: DeepL if a key is set, else
  // a keyless fallback; silently shows just the original on any failure.
  const { note: rawCustomerNote } = splitNotes(booking.notes);
  let translatedNote: string | null = null;
  if (rawCustomerNote && needsTranslationForOwner(booking.locale)) {
    const tr = await translate(rawCustomerNote, { from: booking.locale, to: "EN-GB" });
    if (tr) translatedNote = tr.text;
  }

  // Booking message first so the Confirm / Decline buttons land
  // before the receipt. Receipt then arrives as a reply to the
  // booking message . Telegram renders that as a quoted thread, so
  // it's clearly the deposit attachment for this booking and not a
  // free-standing photo. We fan out to every owner chat sequentially
  // so a 401 on one chat ID doesn't block the others (allSettled).
  // Each successful send returns its message_id; we collect them so
  // the caller can persist them on the booking and let the admin
  // panel edit those exact messages on status change.
  const results = await Promise.allSettled(
    targets.map(async ({ chatId, threadId }) => {
      const msgRes = await callTelegram<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: buildText(booking, unitLabel, translatedNote),
        parse_mode: "MarkdownV2",
        reply_markup: { inline_keyboard: buildKeyboard(booking) },
      });
      const replyToId = msgRes.result?.message_id;

      if (receipt?.url) {
        const isPhoto = PHOTO_MIMES.has(receipt.mime);
        const caption = `Deposit receipt · ${escapeMd(bikeNameFor(booking))} · ${escapeMd(booking.customer_name)}`;
        await callTelegram(isPhoto ? "sendPhoto" : "sendDocument", {
          chat_id: chatId,
          ...(threadId ? { message_thread_id: threadId } : {}),
          [isPhoto ? "photo" : "document"]: receipt.url,
          caption,
          parse_mode: "MarkdownV2",
          ...(replyToId ? { reply_to_message_id: replyToId } : {}),
        });
      }

      return { chatId, messageId: replyToId ?? 0 };
    }),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ chatId: string; messageId: number }> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.messageId > 0);
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
  locale?: string | null;
}): Promise<void> {
  const targets = contactTargets();

  // Same EN-target translation as the booking notes — Thomas wanted a
  // single language to glance at, no matter what locale the visitor
  // wrote in.
  let translatedMessage: string | null = null;
  if (input.message && needsTranslationForOwner(input.locale)) {
    const tr = await translate(input.message, { from: input.locale ?? undefined, to: "EN-GB" });
    if (tr) translatedMessage = tr.text;
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
  lines.push("", escapeMd(input.message));
  if (translatedMessage) {
    lines.push("", "🇬🇧 *English translation*", escapeMd(translatedMessage));
  }
  lines.push("", "_Reply to the email I just sent you to answer this message\\._");

  type InlineKeyboardButton = { text: string; url: string };
  const phoneDigits = input.phone ? input.phone.replace(/[^\d]/g, "") : "";
  const buttons: InlineKeyboardButton[] = [];
  if (phoneDigits) {
    buttons.push({ text: "WhatsApp", url: `https://wa.me/${phoneDigits}` });
  }

  // No mailto: button . Telegram inline-keyboard URLs must be http(s) only,
  // so we put the email inside a code-span (tap to copy) and tell the owner
  // to reply to the parallel email.
  await Promise.allSettled(
    targets.map(({ chatId, threadId }) =>
      callTelegram("sendMessage", {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: lines.join("\n"),
        parse_mode: "MarkdownV2",
        ...(buttons.length > 0
          ? { reply_markup: { inline_keyboard: [buttons] } }
          : {}),
      }),
    ),
  );
}

/**
 * Standalone heads-up to the owner when the customer cancels themselves
 * via the link in the confirmation email. The original booking message
 * may already be far up the chat, so we send a fresh one.
 */
export async function sendOwnerCancellationTelegram(booking: BookingRow): Promise<void> {
  const targets = bookingTargets();

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

  await Promise.allSettled(
    targets.map(({ chatId, threadId }) =>
      callTelegram("sendMessage", {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: lines.join("\n"),
        parse_mode: "MarkdownV2",
        ...(reply_markup ? { reply_markup } : {}),
      }),
    ),
  );
}

type RiderlyBookingForward = {
  bookingId: string;
  bikeName: string | null;
  startDate: string | null;
  endDate: string | null;
  days: number | null;
  totalEur: string | null;
  onlinePaidEur: string | null;
  remainingEur: string | null;
  licenceCountry: string | null;
  licenceCategory: string | null;
  age: number | null;
  acceptUrl: string | null;
  rejectUrl: string | null;
  alternativeUrl: string | null;
  inboxUrl: string | null;
};

type RiderlyForward =
  | { kind: "booking"; receivedAt: Date | null; booking: RiderlyBookingForward }
  | {
      kind: "other";
      receivedAt: Date | null;
      subject: string;
      from: string;
      preview: string;
      riderlyUrl: string | null;
    };

function formatReceived(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleString("de-DE", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Forward a Riderly notification email to the owner's Telegram so all
// bookings (native + Riderly) land in one place. Riderly emails for
// new rental bookings carry magic accept/reject URLs we can attach as
// inline buttons . owner taps Accept directly, Riderly's API processes
// the response, no portal switch.
export async function sendOwnerRiderlyTelegram(email: RiderlyForward): Promise<void> {
  const targets = bookingTargets();

  if (email.kind === "booking") {
    const b = email.booking;
    const when = formatReceived(email.receivedAt);
    const lines = [
      "*New Riderly booking*",
      "",
      `*Booking:* \`${escapeMd(b.bookingId)}\``,
      b.bikeName ? `*Bike:* ${escapeMd(b.bikeName)}` : null,
      b.startDate ? `*Pickup:* ${escapeMd(b.startDate)}` : null,
      b.endDate
        ? `*Return:* ${escapeMd(b.endDate)}${b.days ? ` \\(${b.days} ${b.days === 1 ? "day" : "days"}\\)` : ""}`
        : null,
      b.totalEur ? `*Total:* €${escapeMd(b.totalEur)}` : null,
      b.onlinePaidEur || b.remainingEur
        ? `*Payment:* ${b.onlinePaidEur ? `€${escapeMd(b.onlinePaidEur)} paid online` : ""}${b.onlinePaidEur && b.remainingEur ? " · " : ""}${b.remainingEur ? `€${escapeMd(b.remainingEur)} on pickup` : ""}`
        : null,
      "",
      b.licenceCategory || b.licenceCountry || b.age
        ? `*Customer:* ${[
            b.licenceCategory ? `${escapeMd(b.licenceCategory)} licence` : null,
            b.licenceCountry ? escapeMd(b.licenceCountry) : null,
            b.age ? `age ${b.age}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}`
        : null,
      when ? `_Received ${escapeMd(when)}_` : null,
    ].filter(Boolean) as string[];

    // Inline keyboard: Accept + Reject side by side, then "Propose
    // alternative" / "Open inbox" as fallbacks. Riderly handles the
    // tokenised URLs server-side without login.
    const row1: { text: string; url: string }[] = [];
    if (b.acceptUrl) row1.push({ text: "✓ Accept", url: b.acceptUrl });
    if (b.rejectUrl) row1.push({ text: "✗ Reject", url: b.rejectUrl });
    const row2: { text: string; url: string }[] = [];
    if (b.alternativeUrl) row2.push({ text: "Propose alternative", url: b.alternativeUrl });
    if (b.inboxUrl) row2.push({ text: "Riderly inbox", url: b.inboxUrl });
    const keyboard: { text: string; url: string }[][] = [];
    if (row1.length) keyboard.push(row1);
    if (row2.length) keyboard.push(row2);

    await Promise.allSettled(
      targets.map(({ chatId, threadId }) =>
        callTelegram("sendMessage", {
          chat_id: chatId,
          ...(threadId ? { message_thread_id: threadId } : {}),
          text: lines.join("\n"),
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
          ...(keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
        }),
      ),
    );
    return;
  }

  // Fallback for non-booking Riderly emails (Upcoming Reservations,
  // marketing pings, etc.) . keep the generic preview format.
  const when = formatReceived(email.receivedAt);
  const lines = [
    "*Riderly notification*",
    "",
    `*Subject:* ${escapeMd(email.subject)}`,
    `*From:* ${escapeMd(email.from)}`,
    when ? `*Received:* ${escapeMd(when)}` : "",
    "",
    escapeMd(email.preview),
  ].filter(Boolean);
  const url = email.riderlyUrl ?? "https://riderly.com";
  await Promise.allSettled(
    targets.map(({ chatId, threadId }) =>
      callTelegram("sendMessage", {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: lines.join("\n"),
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: "Open on Riderly", url }]] },
      }),
    ),
  );
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
