import { NextResponse } from "next/server";
import { isLocale, type Locale, DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/config";
import { buildSystemPrompt } from "@/lib/chatbot/knowledge";
import { CATEGORIES } from "@/lib/mockData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small model = fast + cheap enough to be free-ish per conversation.
// Haiku handles all 11 site languages fluently.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_HISTORY = 12; // recent turns kept for context
const MAX_MESSAGE_LEN = 1000;

// Hard guarantee against dead links. The model is told to use only the exact
// PAGE LINKS, but an LLM can still slip a wrong path. Every rentamotozadar.com
// URL in the reply is checked against the REAL routes (and real bike ids) and
// rewritten to a valid link (the homepage fleet section) if the path doesn't
// exist — so a customer can never receive a 404 from the bot.
const VALID_PAGE_SEGMENTS = new Set([
  "group", "info", "faq", "gallery", "contact", "bookings", "impressum", "privacy", "terms",
]);
const VALID_BIKE_IDS = new Set(CATEGORIES.map((c) => c.id));
const SITE = "https://rentamotozadar.com";

function safeInternalUrl(path: string, fallbackLocale: string): string {
  const hashIdx = path.indexOf("#");
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const cleanPath = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const segs = cleanPath.split("/").filter(Boolean);
  let locale = fallbackLocale;
  let rest = segs;
  if (segs.length > 0 && (LOCALES as readonly string[]).includes(segs[0])) {
    locale = segs[0];
    rest = segs.slice(1);
  }
  const home = `${SITE}/${locale}#fleet`;
  // Homepage (optionally with an anchor such as #fleet).
  if (rest.length === 0) return `${SITE}/${locale}${hash}`;
  // Bike page: ONLY /fleet/<known-bike-id> exists — a bare /fleet or a wrong id 404s.
  if (rest[0] === "fleet") {
    if (rest.length === 2 && VALID_BIKE_IDS.has(rest[1])) {
      return `${SITE}/${locale}/fleet/${rest[1]}${hash}`;
    }
    return home;
  }
  // A single known page.
  if (rest.length === 1 && VALID_PAGE_SEGMENTS.has(rest[0])) {
    return `${SITE}/${locale}/${rest[0]}${hash}`;
  }
  return home;
}

function sanitizeInternalLinks(text: string, locale: string): string {
  return text.replace(
    /https?:\/\/(?:www\.)?rentamotozadar\.com([^\s)]*)/gi,
    (_full, path: string) => {
      const trail = /[.,;:!?]+$/.exec(path || "");
      const trailing = trail ? trail[0] : "";
      const clean = trailing ? path.slice(0, path.length - trailing.length) : (path || "");
      return safeInternalUrl(clean, locale) + trailing;
    },
  );
}

// Very light per-IP rate limit so a single visitor can't burn tokens.
// Enough for a real conversation (a burst of 20 messages then a cool-down)
// while still capping abuse.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;
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

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Graceful fallback: bot is disabled until Thomas adds the key.
    return NextResponse.json(
      {
        error: "not_configured",
        message: "The chatbot isn't configured yet. Please contact us on WhatsApp or by email.",
      },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many messages, please try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: { message?: unknown; history?: unknown; locale?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const locale: Locale =
    typeof body.locale === "string" && isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter(
      (t): t is Turn =>
        !!t &&
        typeof t === "object" &&
        (t as Turn).role !== undefined &&
        typeof (t as Turn).content === "string",
    )
    .slice(-MAX_HISTORY)
    .map((t) => ({
      role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: t.content.slice(0, MAX_MESSAGE_LEN),
    }));

  const system = buildSystemPrompt(locale);
  const messages = [...history, { role: "user" as const, content: message }];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[/api/chatbot] anthropic", res.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: "upstream", message: "The chatbot is having a hiccup. Please try again or contact us on WhatsApp." },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!text) {
      return NextResponse.json(
        { error: "empty", message: "Sorry, I don't have an answer for that. Please contact us on WhatsApp." },
        { status: 502 },
      );
    }
    return NextResponse.json({ reply: sanitizeInternalLinks(text, locale) });
  } catch (err) {
    console.error("[/api/chatbot] network", err);
    return NextResponse.json(
      { error: "network", message: "The chatbot couldn't be reached. Please try again." },
      { status: 502 },
    );
  }
}
