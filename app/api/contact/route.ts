import { NextResponse, after } from "next/server";
import { sendOwnerContactMessage } from "@/lib/telegram";
import {
  sendOwnerContactEmail,
  sendCustomerContactReceivedEmail,
} from "@/lib/email";
import { markEmailReadByHeader } from "@/lib/imap-mark";
import { isLocale } from "@/lib/i18n/config";
import { judgeContact } from "@/lib/contact-spam";

export const dynamic = "force-dynamic";

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  locale?: unknown;
  // Spam gate inputs (see lib/contact-spam.ts): the honeypot field and the
  // form's load timestamp. Real submissions from ContactForm always send ts.
  website?: unknown;
  ts?: unknown;
};

// Light per-IP rate limit, same shape as the chatbot's: a real person sends
// one or two messages, a script sends dozens.
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const bucket = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = bucket.get(ip);
  if (!b || now >= b.resetAt) {
    bucket.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  b.count++;
  return b.count > RATE_LIMIT;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

// POST /api/contact - generic contact-form submission. Customer-without-WhatsApp
// path: name + email + message land as a Telegram ping for the owner and an
// email so the message is in their inbox too. Customer also gets a quick
// 'we got your message' acknowledgement.
export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = asString(body.name);
  const email = asString(body.email);
  const phone = asString(body.phone);
  const message = asString(body.message);
  const localeRaw = asString(body.locale);
  // Accept every site locale (the old hardcoded list dropped hu/sk/cs/pt, so
  // those visitors got an English acknowledgement). This drives the customer
  // ack-email language; the owner-notification translation now auto-detects
  // the message language regardless of this value.
  const locale = localeRaw && isLocale(localeRaw) ? localeRaw : "en";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many messages, please try again in a few minutes." },
      { status: 429 },
    );
  }

  // ---- Spam gate: runs BEFORE anything is sent or translated ----
  const verdict = judgeContact({
    name,
    message,
    honeypot: asString(body.website),
    formLoadedAt: typeof body.ts === "number" ? body.ts : null,
    now: Date.now(),
  });
  if (verdict.kind === "drop") {
    // Look exactly like success so the bot doesn't adapt. Logged so the
    // volume stays visible in the Vercel logs.
    console.warn("[/api/contact] dropped spam", verdict.reason, { ip, name: name.slice(0, 40) });
    return NextResponse.json({ ok: true });
  }
  if (verdict.kind === "retry") {
    return NextResponse.json(
      { error: "Please take a moment and send again." },
      { status: 400 },
    );
  }

  const payload = { name, email, phone, message };

  after(async () => {
    const [tgResult, emailResult] = await Promise.allSettled([
      sendOwnerContactMessage({ ...payload, locale }),
      sendOwnerContactEmail({ ...payload, locale }),
      sendCustomerContactReceivedEmail({ ...payload, locale }),
    ]);
    // If Telegram delivered the ping, archive the parallel owner
    // email so the inbox doesn't pile up duplicates. Telegram
    // failure → email stays unread as the backup signal.
    if (
      tgResult.status === "fulfilled" &&
      emailResult.status === "fulfilled" &&
      emailResult.value
    ) {
      await markEmailReadByHeader("X-Contact-Ref", emailResult.value);
    }
  });

  return NextResponse.json({ ok: true });
}
