#!/usr/bin/env node
// Standalone Riderly inbox poller. Runs from GitHub Actions on a
// schedule (every 15 minutes), connects to Gmail via IMAP, classifies
// each unread message and forwards it to the owner's Telegram. No
// Vercel involved — serverless functions and long-lived IMAP TCP
// connections don't get along, so we run this in a real Node
// environment instead.
//
// Required env vars (set as GitHub Actions secrets on the repo):
//   RIDERLY_IMAP_USER       - the Gmail inbox to poll
//   RIDERLY_IMAP_PASSWORD   - Gmail App Password (16 chars, spaces OK)
//   RIDERLY_LABEL           - mailbox name, default INBOX
//   RIDERLY_IMAP_HOST       - default imap.gmail.com
//   TELEGRAM_BOT_TOKEN      - same one Vercel uses
//   TELEGRAM_OWNER_CHAT_ID  - same one Vercel uses

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const env = (key, fallback) => process.env[key]?.trim() || fallback;

const IMAP_USER = env("RIDERLY_IMAP_USER");
const IMAP_PASS = env("RIDERLY_IMAP_PASSWORD");
const IMAP_HOST = env("RIDERLY_IMAP_HOST", "imap.gmail.com");
const IMAP_PORT = parseInt(env("RIDERLY_IMAP_PORT", "993"), 10);
const LABEL = env("RIDERLY_LABEL", "INBOX");
const TG_TOKEN = env("TELEGRAM_BOT_TOKEN");
const TG_CHAT = env("TELEGRAM_OWNER_CHAT_ID");

if (!IMAP_USER || !IMAP_PASS) {
  console.error("RIDERLY_IMAP_USER / RIDERLY_IMAP_PASSWORD env vars not set");
  process.exit(1);
}
if (!TG_TOKEN || !TG_CHAT) {
  console.error("TELEGRAM_BOT_TOKEN / TELEGRAM_OWNER_CHAT_ID env vars not set");
  process.exit(1);
}

// ---------- HTML -> text + field extraction ---------------------------------

function htmlToText(html) {
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

function findHref(html, pattern) {
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (pattern.test(url)) return url;
  }
  return null;
}

function extractAfterLabel(text, label) {
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]) return lines[j];
    }
  }
  return null;
}

function clip(text, max) {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + "…";
}

function escapeMd(s) {
  return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function isNewBookingEmail(subject, html) {
  if (/new rental booking/i.test(subject)) return true;
  if (/\/api\/rental-booking\/accept\//i.test(html)) return true;
  return false;
}

function parseNewBooking(parsed) {
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const subject = parsed.subject ?? "";
  const text = htmlToText(html);

  const idMatch =
    /New Rental Booking\s*[-–]\s*([A-Z0-9]+)/i.exec(subject) ??
    /Booking\s*#\s*\n\s*([A-Z0-9]+)/m.exec(text);
  const bookingId = idMatch?.[1] ?? "(unknown)";

  const bikeMatch = /New booking request for an?\s+([^.\n]+?)\s+on\s+/i.exec(text);
  const bikeName = bikeMatch?.[1]?.trim() ?? null;

  const dateRe = /([A-Z\s]+DATE)\s*\n\s*(\(?\w+\)?\s*\d{1,2}\s+\w+\s+\d{4},?\s*\d{1,2}:\d{2})/g;
  const dates = {};
  for (const m of text.matchAll(dateRe)) {
    dates[m[1].trim().toUpperCase()] = m[2].replace(/\s+/g, " ").trim();
  }

  const daysMatch = /for\s+(\d+)\s+days?/i.exec(text);
  const totalEur = /(?:^|\n)\s*Price\s*\n+\s*€\s*\n?\s*([0-9]+(?:\.[0-9]+)?)/m.exec(text)?.[1] ?? null;
  const negPrices = [...text.matchAll(/-\s*€\s*\n?\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) => m[1]);
  const onlinePaidEur = negPrices.length > 0 ? negPrices[negPrices.length - 1] : null;
  const remainingEur = /Remaining\s+Payment\s*\n+\s*€\s*([0-9]+(?:\.[0-9]+)?)/i.exec(text)?.[1] ?? null;

  const ageStr = extractAfterLabel(text, "Age");
  const age = ageStr && /^\d+$/.test(ageStr) ? parseInt(ageStr, 10) : null;

  return {
    bookingId,
    bikeName,
    startDate: dates["START DATE"] ?? null,
    endDate: dates["END DATE"] ?? null,
    days: daysMatch ? parseInt(daysMatch[1], 10) : null,
    totalEur,
    onlinePaidEur,
    remainingEur,
    licenceCountry: extractAfterLabel(text, "Licence"),
    licenceCategory: extractAfterLabel(text, "Category"),
    age,
    acceptUrl: findHref(html, /\/api\/rental-booking\/accept\/[A-Za-z0-9_-]+/),
    rejectUrl: findHref(html, /\/api\/rental-booking\/reject\/[A-Za-z0-9_-]+/),
    alternativeUrl: findHref(html, /riderly\.com\/business\/rentals\/inbox\/[^"\s]*/),
    inboxUrl: findHref(html, /riderly\.com\/business\/rentals\/inbox/),
  };
}

function parseOther(parsed) {
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = parsed.text ?? htmlToText(html);
  return {
    subject: parsed.subject ?? "(no subject)",
    from: parsed.from?.value?.[0]?.address ?? "(unknown)",
    preview: clip(text.replace(/\s+/g, " ").trim(), 600),
    riderlyUrl: findHref(html, /riderly\.com/),
  };
}

function classify(parsed) {
  const subject = parsed.subject ?? "";
  const html = typeof parsed.html === "string" ? parsed.html : "";
  if (isNewBookingEmail(subject, html)) {
    return { kind: "booking", receivedAt: parsed.date ?? null, booking: parseNewBooking(parsed) };
  }
  return { kind: "other", receivedAt: parsed.date ?? null, ...parseOther(parsed) };
}

// ---------- Telegram --------------------------------------------------------

function formatReceived(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("de-DE", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function tg(method, body) {
  // Hard 15s timeout — fetch() in Node has no default deadline, and a
  // hung connection to api.telegram.org would otherwise pin the
  // whole GitHub Actions job until the workflow's own timeout kicks
  // in.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Telegram ${method} ${res.status}: ${await res.text()}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function sendRiderlyTelegram(email) {
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
    ].filter(Boolean);

    const row1 = [];
    if (b.acceptUrl) row1.push({ text: "✓ Accept", url: b.acceptUrl });
    if (b.rejectUrl) row1.push({ text: "✗ Reject", url: b.rejectUrl });
    const row2 = [];
    if (b.alternativeUrl) row2.push({ text: "Propose alternative", url: b.alternativeUrl });
    if (b.inboxUrl) row2.push({ text: "Riderly inbox", url: b.inboxUrl });
    const keyboard = [];
    if (row1.length) keyboard.push(row1);
    if (row2.length) keyboard.push(row2);

    await tg("sendMessage", {
      chat_id: TG_CHAT,
      text: lines.join("\n"),
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      ...(keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
    return;
  }

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
  await tg("sendMessage", {
    chat_id: TG_CHAT,
    text: lines.join("\n"),
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "Open on Riderly", url }]] },
  });
}

// ---------- IMAP poll -------------------------------------------------------

async function main() {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false,
  });

  const t0 = Date.now();
  console.log(`[riderly] connecting ${IMAP_HOST}:${IMAP_PORT} as ${IMAP_USER.slice(0, 6)}…`);
  await client.connect();
  console.log(`[riderly] connected in ${Date.now() - t0}ms`);

  let processed = 0;
  try {
    const lock = await client.getMailboxLock(LABEL);
    console.log(`[riderly] lock acquired on ${LABEL}`);
    try {
      for await (const msg of client.fetch(
        { seen: false },
        { source: true, envelope: true, uid: true },
      )) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const email = classify(parsed);
        console.log(`[riderly] forwarding ${email.kind} message uid=${msg.uid}`);
        let telegramOk = false;
        try {
          await sendRiderlyTelegram(email);
          telegramOk = true;
          processed++;
        } catch (err) {
          console.error(`[riderly] telegram failed uid=${msg.uid}:`, err.message);
        }
        // Mark as read EVEN if Telegram failed — otherwise a single
        // bad message blocks every subsequent tick in an endless loop.
        // We log the failure above so the message can be re-sent
        // manually if needed.
        if (msg.uid) {
          try {
            await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
            if (!telegramOk) {
              console.warn(`[riderly] uid=${msg.uid} marked read despite telegram failure`);
            }
          } catch (err) {
            console.error(`[riderly] mark-read failed uid=${msg.uid}:`, err.message);
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  console.log(`[riderly] done — forwarded ${processed} message(s) in ${Date.now() - t0}ms`);
}

main().catch((err) => {
  console.error("[riderly] fatal:", err);
  process.exit(1);
});
