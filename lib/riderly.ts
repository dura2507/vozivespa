import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

// Riderly is a separate booking platform that doesn't expose an API.
// Their notification emails do contain magic accept/reject URLs the
// owner can click without login though, so we mirror those into the
// Telegram alert as inline buttons. One tap → booking confirmed on
// Riderly. No portal switch needed.

export type RiderlyBooking = {
  bookingId: string;
  bikeName: string | null;
  startDate: string | null; // "(Wed) 06 May 2026, 10:00"
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

export type RiderlyEmail =
  | {
      kind: "booking";
      receivedAt: Date | null;
      booking: RiderlyBooking;
    }
  | {
      kind: "other";
      receivedAt: Date | null;
      subject: string;
      from: string;
      preview: string;
      riderlyUrl: string | null;
    };

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// Reduce a Riderly HTML email into readable plain text. Riderly emails
// don't include a text/plain alternative, so we have to derive one
// from the HTML.
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|tr|li|h[1-6]|td|th)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findHrefMatching(html: string, pattern: RegExp): string | null {
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (pattern.test(url)) return url;
  }
  return null;
}

function extractAfterLabel(text: string, label: string): string | null {
  // Field labels in Riderly's HTML render as their own paragraph
  // followed by the value on the next non-empty line. Walk the lines
  // explicitly so a regex search position can't trip us up.
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]) return lines[j];
    }
  }
  return null;
}

function isNewBookingEmail(subject: string, html: string): boolean {
  if (/new rental booking/i.test(subject)) return true;
  if (/\/api\/rental-booking\/accept\//i.test(html)) return true;
  return false;
}

function parseNewBooking(parsed: ParsedMail): RiderlyBooking {
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const subject = parsed.subject ?? "";
  const text = htmlToText(html);

  const idMatch =
    /New Rental Booking\s*[-–]\s*([A-Z0-9]+)/i.exec(subject) ??
    /Booking\s*#\s*\n\s*([A-Z0-9]+)/m.exec(text);
  const bookingId = idMatch?.[1] ?? "(unknown)";

  const bikeMatch = /New booking request for an?\s+([^.\n]+?)\s+on\s+/i.exec(text);
  const bikeName = bikeMatch?.[1]?.trim() ?? null;

  const dateRe =
    /([A-Z\s]+DATE)\s*\n\s*(\(?\w+\)?\s*\d{1,2}\s+\w+\s+\d{4},?\s*\d{1,2}:\d{2})/g;
  const dates: Record<string, string> = {};
  for (const m of text.matchAll(dateRe)) {
    dates[m[1].trim().toUpperCase()] = m[2].replace(/\s+/g, " ").trim();
  }
  const startDate = dates["START DATE"] ?? null;
  const endDate = dates["END DATE"] ?? null;

  const daysMatch = /for\s+(\d+)\s+days?/i.exec(text);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : null;

  // The price summary is a 2-column "Item / Price" block. After
  // collapsing HTML to text the prices stack as their own lines:
  //   € 100.00          (Motorbike Rental)
  //   € 0.00            (Optional Extras)
  //   - € 0.00          (Discount)
  //   - € 15.00         (Online Payment 15%)
  //   € 85.00           (Remaining Payment, after a "Remaining" header)
  // Pull them in order so we don't have to reason about exact line
  // positions.
  const totalEur =
    /(?:^|\n)\s*Price\s*\n+\s*€\s*\n?\s*([0-9]+(?:\.[0-9]+)?)/m.exec(text)?.[1] ?? null;
  const negativePrices = [
    ...text.matchAll(/-\s*€\s*\n?\s*([0-9]+(?:\.[0-9]+)?)/g),
  ].map((m) => m[1]);
  const onlinePaidEur =
    negativePrices.length > 0 ? negativePrices[negativePrices.length - 1] : null;
  const remainingEur =
    /Remaining\s+Payment\s*\n+\s*€\s*([0-9]+(?:\.[0-9]+)?)/i.exec(text)?.[1] ?? null;

  const licenceCountry = extractAfterLabel(text, "Licence");
  const licenceCategory = extractAfterLabel(text, "Category");
  const ageStr = extractAfterLabel(text, "Age");
  const age = ageStr && /^\d+$/.test(ageStr) ? parseInt(ageStr, 10) : null;

  const acceptUrl = findHrefMatching(
    html,
    /\/api\/rental-booking\/accept\/[A-Za-z0-9_-]+/,
  );
  const rejectUrl = findHrefMatching(
    html,
    /\/api\/rental-booking\/reject\/[A-Za-z0-9_-]+/,
  );
  const alternativeUrl = findHrefMatching(
    html,
    /riderly\.com\/business\/rentals\/inbox\/[^"\s]*/,
  );
  const inboxUrl = findHrefMatching(
    html,
    /riderly\.com\/business\/rentals\/inbox/,
  );

  return {
    bookingId,
    bikeName,
    startDate,
    endDate,
    days,
    totalEur,
    onlinePaidEur,
    remainingEur,
    licenceCountry,
    licenceCategory,
    age,
    acceptUrl,
    rejectUrl,
    alternativeUrl,
    inboxUrl,
  };
}

function parseOther(parsed: ParsedMail): {
  subject: string;
  from: string;
  preview: string;
  riderlyUrl: string | null;
} {
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = parsed.text ?? htmlToText(html);
  const subject = parsed.subject ?? "(no subject)";
  const from = parsed.from?.value?.[0]?.address ?? "(unknown)";
  const preview = clip(text.replace(/\s+/g, " ").trim(), 600);
  const riderlyUrl = findHrefMatching(html, /riderly\.com/);
  return { subject, from, preview, riderlyUrl };
}

// Public for testing — turn a parsed mail object into our typed
// RiderlyEmail union, dispatching on email kind.
export function classifyRiderly(parsed: ParsedMail): RiderlyEmail {
  const subject = parsed.subject ?? "";
  const html = typeof parsed.html === "string" ? parsed.html : "";
  if (isNewBookingEmail(subject, html)) {
    return {
      kind: "booking",
      receivedAt: parsed.date ?? null,
      booking: parseNewBooking(parsed),
    };
  }
  return { kind: "other", receivedAt: parsed.date ?? null, ...parseOther(parsed) };
}

// Connects to the configured mailbox, fetches every unseen message
// from the configured label, classifies each into a RiderlyEmail and
// marks them as read so the next cron tick only sees fresh
// notifications. Throws on connection / auth issues so the cron
// handler can log + 500.
export async function pollRiderlyInbox(): Promise<RiderlyEmail[]> {
  const user = process.env.RIDERLY_IMAP_USER?.trim();
  const pass = process.env.RIDERLY_IMAP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error("RIDERLY_IMAP_USER / RIDERLY_IMAP_PASSWORD env vars not set");
  }
  const host = process.env.RIDERLY_IMAP_HOST?.trim() || "imap.gmail.com";
  const port = parseInt(process.env.RIDERLY_IMAP_PORT ?? "993", 10);
  const mailbox = process.env.RIDERLY_LABEL?.trim() || "INBOX";

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const out: RiderlyEmail[] = [];
  const t0 = Date.now();
  console.log(`[riderly] connect host=${host} port=${port} user=${user.slice(0, 6)}…`);
  await client.connect();
  console.log(`[riderly] connected in ${Date.now() - t0}ms`);
  try {
    const lock = await client.getMailboxLock(mailbox);
    console.log(`[riderly] mailbox lock acquired (${mailbox}) at ${Date.now() - t0}ms`);
    try {
      for await (const msg of client.fetch(
        { seen: false },
        { source: true, envelope: true, uid: true },
      )) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        out.push(classifyRiderly(parsed));
        if (msg.uid) {
          await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
    console.log(`[riderly] done — ${out.length} message(s) in ${Date.now() - t0}ms total`);
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
