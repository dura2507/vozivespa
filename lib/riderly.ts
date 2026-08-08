import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { CATEGORIES } from "@/lib/mockData";

// Hardcoded sender allowlist. Only mails whose From address contains one
// of these substrings are downloaded, parsed, forwarded or imported.
// Everything else in the mailbox is ignored entirely (and left untouched,
// see processRiderlyInbox).
//
// Note this is a plain substring test, so it matches the exact domain
// only: helena@chat.riderly.com does NOT contain "@riderly.com" and is
// therefore skipped. Riderly's booking notifications come from
// reservations@riderly.com (verified live 2026-08-07).
const ALLOWED_FROM = [
  "@riderly.com", // PRODUCTION
];

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

  // Dash class uses unicode escapes on purpose. A repo-wide dash cleanup
  // once flattened this class to [--] (a range from hyphen to hyphen),
  // which stops matching Riderly's en-dash subject line. The fallout is
  // silent: bookingId drops to "(unknown)", and since that string is
  // also the dedupe key, the SECOND such booking is skipped as a
  // duplicate and never reaches the calendar. Escapes survive the pass.
  const idMatch =
    /New Rental Booking\s*[-\u2013\u2014]\s*([A-Z0-9]+)/i.exec(subject) ??
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

// Public for testing . turn a parsed mail object into our typed
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
export type RiderlyCandidate = {
  uid: number;
  // Was the message still unread when we found it? Drives whether the
  // owner gets pinged; the IMPORT decision is independent of this.
  wasUnseen: boolean;
  subject: string;
  from: string;
  // Riderly puts the booking id in the subject, so we know it before
  // downloading the body. Lets the caller ask "do we already have this?"
  // and skip the download entirely.
  bookingId: string | null;
};

// Extract the Riderly booking id from a subject line, without needing the
// body. Same dash class as parseNewBooking (unicode escapes on purpose).
export function bookingIdFromSubject(subject: string): string | null {
  const m = /New Rental Booking\s*[-\u2013\u2014]\s*([A-Z0-9]+)/i.exec(subject);
  return m ? m[1] : null;
}

export type RiderlyPollStats = {
  scanned: number;
  candidates: number;
  fetched: number;
  handled: number;
  markedRead: number;
};

// Walk the mailbox and hand every relevant Riderly mail to the caller.
//
// Two properties this design exists for, both learned the hard way:
//
//  1. IMPORTING MUST NOT DEPEND ON THE UNREAD FLAG. The old poller fetched
//     `{ seen: false }` only. Anything already read was invisible to it
//     forever, so a booking could never reach the calendar. That is how
//     four Riderly bookings went missing in Aug 2026.
//  2. NEVER MARK READ BEFORE THE WORK IS DONE. The old poller flagged every
//     message \Seen inside this function, then the route did the actual
//     forwarding and inserting. When a slow IMAP day pushed the request
//     past maxDuration, the mail was already read but nothing had been
//     forwarded or inserted, and no later run would ever look at it again.
//     Now the caller reports success per message and only those get
//     flagged, so a timeout costs one retry instead of one booking.
export async function processRiderlyInbox(opts: {
  windowDays?: number;
  // Cheap gate: given the envelope-level info, do we need the body?
  // Return false to skip the download entirely (already-imported mail).
  needsBody: (c: RiderlyCandidate) => boolean | Promise<boolean>;
  // Do the real work. Return true only if everything that had to happen
  // happened - that is the sole trigger for marking the mail read.
  handle: (email: RiderlyEmail, c: RiderlyCandidate) => Promise<boolean>;
}): Promise<RiderlyPollStats> {
  const user = process.env.RIDERLY_IMAP_USER?.trim();
  const pass = process.env.RIDERLY_IMAP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error("RIDERLY_IMAP_USER / RIDERLY_IMAP_PASSWORD env vars not set");
  }
  const host = process.env.RIDERLY_IMAP_HOST?.trim() || "imap.gmail.com";
  const port = parseInt(process.env.RIDERLY_IMAP_PORT ?? "993", 10);
  const mailbox = process.env.RIDERLY_LABEL?.trim() || "INBOX";
  const windowDays = opts.windowDays ?? 21;

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const stats: RiderlyPollStats = {
    scanned: 0,
    candidates: 0,
    fetched: 0,
    handled: 0,
    markedRead: 0,
  };
  const t0 = Date.now();
  console.log(`[riderly] connect host=${host} port=${port} user=${user.slice(0, 6)}…`);
  await client.connect();
  console.log(`[riderly] connected in ${Date.now() - t0}ms`);

  const markSeenUids: number[] = [];
  try {
    // ---- Phase 1: envelopes + flags only. Cheap, so a busy mailbox
    // cannot blow the function budget just by existing.
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const candidates: RiderlyCandidate[] = [];
    const lock = await client.getMailboxLock(mailbox);
    console.log(`[riderly] mailbox lock acquired (${mailbox}) at ${Date.now() - t0}ms`);
    try {
      for await (const msg of client.fetch(
        { since },
        { envelope: true, flags: true, uid: true },
      )) {
        if (!msg.uid) continue;
        stats.scanned++;
        const from = (msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
        const subject = msg.envelope?.subject ?? "";
        const wasUnseen = !(msg.flags?.has("\\Seen") ?? false);
        if (!ALLOWED_FROM.some((s) => from.includes(s))) {
          // Unrelated mail is left completely alone. The old poller marked
          // it read "to keep the inbox tidy", which quietly destroys the
          // owner's unread signal on mail we never even look at - including
          // Riderly's own customer chat (helena@chat.riderly.com does NOT
          // contain "@riderly.com"). Not ours to touch.
          continue;
        }
        candidates.push({
          uid: msg.uid,
          wasUnseen,
          subject,
          from,
          bookingId: bookingIdFromSubject(subject),
        });
      }
    } finally {
      lock.release();
    }
    stats.candidates = candidates.length;
    console.log(
      `[riderly] scanned ${stats.scanned} msg(s) since ${since.toISOString().slice(0, 10)}, ${candidates.length} from allowlisted senders`,
    );

    // ---- Phase 2: ask the caller which ones actually need the body.
    const wanted: RiderlyCandidate[] = [];
    for (const c of candidates) {
      try {
        if (await opts.needsBody(c)) wanted.push(c);
      } catch (err) {
        // If we cannot tell, err on the side of looking at it.
        console.warn(`[riderly] needsBody failed for uid=${c.uid}, fetching anyway`, err);
        wanted.push(c);
      }
    }
    if (wanted.length === 0) {
      console.log(`[riderly] nothing to fetch (all ${candidates.length} known + read)`);
    }

    // ---- Phase 3: download, parse and hand over, one message at a time.
    if (wanted.length > 0) {
      const byUid = new Map(wanted.map((c) => [c.uid, c]));
      const lock2 = await client.getMailboxLock(mailbox);
      try {
        for await (const msg of client.fetch(
          wanted.map((c) => c.uid).join(","),
          { source: true, uid: true },
          { uid: true },
        )) {
          const cand = msg.uid ? byUid.get(msg.uid) : undefined;
          if (!msg.source || !cand) continue;
          stats.fetched++;
          // Per-message isolation: one unparseable mail must not abort the
          // batch, or a single poison message stalls the integration for
          // as long as it sits inside the window.
          try {
            const parsed = await simpleParser(msg.source);
            const ok = await opts.handle(classifyRiderly(parsed), cand);
            if (ok) {
              stats.handled++;
              if (cand.wasUnseen) markSeenUids.push(cand.uid);
            } else {
              console.warn(`[riderly] uid=${cand.uid} not handled, leaving unread for retry`);
            }
          } catch (err) {
            console.error(`[riderly] uid=${cand.uid} failed, leaving unread for retry`, err);
          }
        }
      } finally {
        lock2.release();
      }
    }

    // ---- Phase 4: flag only what we actually finished.
    if (markSeenUids.length > 0) {
      const lock3 = await client.getMailboxLock(mailbox);
      try {
        const ok = await client.messageFlagsAdd(markSeenUids, ["\\Seen"], { uid: true });
        // messageFlagsAdd swallows its own errors and returns false. Say so
        // out loud instead of logging a success we did not verify.
        if (ok) {
          stats.markedRead = markSeenUids.length;
          console.log(`[riderly] marked ${markSeenUids.length} message(s) as read`);
        } else {
          console.warn(`[riderly] could NOT mark ${markSeenUids.length} message(s) as read`);
        }
      } finally {
        lock3.release();
      }
    }

    console.log(
      `[riderly] done. scanned=${stats.scanned} riderly=${stats.candidates} fetched=${stats.fetched} handled=${stats.handled} read=${stats.markedRead} in ${Date.now() - t0}ms`,
    );
  } finally {
    await client.logout().catch(() => {});
  }
  return stats;
}

// Map a Riderly bike name to our internal bike_id. Their emails use the
// full model name ("Piaggio Liberty 125") while we store slugs
// ("scooter-125"). Simple substring / word overlap — the model list is
// tiny, so a fancier matcher isn't worth it. Returns null when we can't
// tell, so the caller can flag the row for manual bike assignment.
export function mapRiderlyBikeName(riderlyName: string | null): string | null {
  if (!riderlyName) return null;
  const q = riderlyName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!q) return null;
  let best: { id: string; score: number } | null = null;
  for (const cat of CATEGORIES) {
    const hay = `${cat.model} ${cat.shortName ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const qTokens = q.split(" ").filter((t) => t.length >= 2);
    const hits = qTokens.filter((t) => hay.includes(t)).length;
    // Boost when a "topcase" hint agrees with the id — otherwise
    // "Piaggio Liberty 50" would tie with "Piaggio Liberty 50 Topcase".
    const wantsTopcase = /top\s*case|topcase/i.test(riderlyName);
    const bonus = wantsTopcase === /topcase/.test(cat.id) ? 1 : 0;
    const score = hits * 10 + bonus;
    if (!best || score > best.score) best = { id: cat.id, score };
  }
  return best && best.score >= 20 ? best.id : null;
}

// Parse a Riderly datetime string like "(Wed) 06 May 2026, 10:00" into
// ISO date + wallclock time. Riderly's format is stable — day-name
// prefix optional, day / month-name / year, comma, HH:MM. Returns null
// on anything unrecognisable so the insert can bail cleanly.
export function parseRiderlyDateTime(
  raw: string | null,
): { date: string; time: string } | null {
  if (!raw) return null;
  const m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, dayStr, monthName, yearStr, hStr, minStr] = m;
  const monthIx = [
    "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
  ].indexOf(monthName.slice(0, 3).toLowerCase());
  if (monthIx < 0) return null;
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  const hour = parseInt(hStr, 10);
  const minute = parseInt(minStr, 10);
  if (Number.isNaN(day + year + hour + minute)) return null;
  const iso = `${year}-${String(monthIx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { date: iso, time };
}
