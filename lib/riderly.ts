import { simpleParser, type ParsedMail } from "mailparser";

// Riderly is a separate booking platform that doesn't expose an API.
// Their notification emails carry magic accept/reject URLs the owner
// can click without login though, so we mirror those into the Telegram
// alert as inline buttons. One tap → booking confirmed on Riderly.
//
// We poll the owner's Gmail via the Gmail API (OAuth2 refresh-token
// flow). IMAP would have worked too but Google has deprecated App
// Passwords across many accounts, and Gmail API + OAuth is the
// Google-blessed modern way + works on every account regardless of
// 2FA setup.

export type RiderlyBooking = {
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

export type RiderlyEmail =
  | { kind: "booking"; receivedAt: Date | null; booking: RiderlyBooking }
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

// --- Gmail API client (OAuth2 refresh-token flow) ---------------------------

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN env vars not set",
    );
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function listUnreadIds(accessToken: string, query: string): Promise<string[]> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", `is:unread ${query}`.trim());
  url.searchParams.set("maxResults", "25");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

async function fetchRawMessage(accessToken: string, id: string): Promise<Buffer> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail fetch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { raw: string };
  // Gmail returns RFC822 in base64url. Convert to standard base64 + decode.
  const base64 = data.raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

async function markAsRead(accessToken: string, id: string): Promise<void> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  if (!res.ok) {
    throw new Error(`Gmail mark-read failed: ${res.status} ${await res.text()}`);
  }
}

// Poll the configured Gmail inbox for unread Riderly notifications.
// Each message is fetched, parsed and classified, then marked as read
// so the next cron tick only sees fresh notifications. The Gmail query
// (default `from:reservations@riderly.com`) can be overridden via the
// RIDERLY_GMAIL_QUERY env var if owner uses labels or a different
// sender.
export async function pollRiderlyInbox(): Promise<RiderlyEmail[]> {
  const query =
    process.env.RIDERLY_GMAIL_QUERY?.trim() || "from:reservations@riderly.com";
  const accessToken = await getAccessToken();
  const ids = await listUnreadIds(accessToken, query);
  const out: RiderlyEmail[] = [];
  for (const id of ids) {
    try {
      const raw = await fetchRawMessage(accessToken, id);
      const parsed = await simpleParser(raw);
      out.push(classifyRiderly(parsed));
      await markAsRead(accessToken, id);
    } catch (err) {
      console.error(`[riderly] failed processing message ${id}`, err);
    }
  }
  return out;
}
