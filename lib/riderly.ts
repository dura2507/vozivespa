import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { CATEGORIES } from "@/lib/mockData";

// Hardcoded sender allowlist. Only mails whose From address contains
// one of these substrings get forwarded to Telegram. Everything else
// (Kristian sending tests, Google welcome, Facebook notifications,
// random spam) gets silently marked as read.
//
// To switch to production-only: delete the leon line and push.
const ALLOWED_FROM = [
  "leon.huschka@duraska.com", // TEST, remove for production
  "@riderly.com",             // PRODUCTION, keep
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

  // Two-phase: drain the fetch iterator into a local array while the
  // lock is held, then mark every UID as read in a single batch after
  // the lock is released. Mixing messageFlagsAdd into an active fetch
  // iterator deadlocks imapflow, which manifests on Vercel as a
  // FUNCTION_INVOCATION_TIMEOUT at maxDuration. The earlier inline
  // version of this loop hit that bug.
  const buffered: { uid: number; email: RiderlyEmail }[] = [];
  const seenUids: number[] = [];
  try {
    const lock = await client.getMailboxLock(mailbox);
    console.log(`[riderly] mailbox lock acquired (${mailbox}) at ${Date.now() - t0}ms`);
    try {
      for await (const msg of client.fetch(
        { seen: false },
        { source: true, envelope: true, uid: true },
      )) {
        if (!msg.source || !msg.uid) continue;
        const parsed = await simpleParser(msg.source);
        const fromAddr = (parsed.from?.value?.[0]?.address ?? "").toLowerCase();
        const isAllowed = ALLOWED_FROM.some((s) => fromAddr.includes(s));
        if (!isAllowed) {
          console.log(`[riderly] skipping uid=${msg.uid} from=${fromAddr} (not in allowlist)`);
          seenUids.push(msg.uid);
          continue;
        }
        console.log(`[riderly] forwarding uid=${msg.uid} from=${fromAddr}`);
        buffered.push({ uid: msg.uid, email: classifyRiderly(parsed) });
        seenUids.push(msg.uid);
      }
    } finally {
      lock.release();
    }

    if (seenUids.length > 0) {
      const lock = await client.getMailboxLock(mailbox);
      try {
        await client.messageFlagsAdd(seenUids, ["\\Seen"], { uid: true });
        console.log(`[riderly] marked ${seenUids.length} message(s) as read`);
      } finally {
        lock.release();
      }
    }

    for (const b of buffered) out.push(b.email);
    console.log(`[riderly] done. ${out.length} forwarded, ${seenUids.length - buffered.length} skipped, in ${Date.now() - t0}ms total`);

    // ---- READ-ONLY diagnostic (temporary, 2026-08-07) ----------------
    // Thomas: "Riderly hängt". The cron reports 0 forwarded AND 0 skipped
    // every tick, i.e. the mailbox holds no UNREAD mail at all, so we
    // cannot tell these three apart:
    //   (a) Riderly stopped mailing us / mails go elsewhere,
    //   (b) mails arrive but a human opens them first (the poller only
    //       ever looks at unread, so they are invisible to it forever),
    //   (c) Riderly changed its sender and the allowlist misses it.
    // This scan reads envelopes only. It fetches no bodies, changes no
    // flags, imports nothing, and any failure is swallowed, so it cannot
    // affect the poll above. Remove once the question is answered.
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const diagLock = await client.getMailboxLock(mailbox);
      try {
        let total = 0;
        let hits = 0;
        for await (const msg of client.fetch(
          { since },
          { envelope: true, flags: true, uid: true },
        )) {
          total++;
          const from = (msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
          const subject = msg.envelope?.subject ?? "";
          if (!/riderly/i.test(from) && !/riderly|rental booking/i.test(subject)) continue;
          hits++;
          const state = msg.flags?.has("\\Seen") ? "READ" : "UNREAD";
          console.log(
            `[riderly:diag] uid=${msg.uid} ${state} from=${from} subject=${clip(subject, 90)}`,
          );
        }
        console.log(
          `[riderly:diag] mailbox=${mailbox} window=14d messages=${total} riderly-looking=${hits}`,
        );
      } finally {
        diagLock.release();
      }
    } catch (err) {
      console.warn("[riderly:diag] scan failed (ignored)", err);
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
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
