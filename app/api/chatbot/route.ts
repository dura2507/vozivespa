import { NextResponse, after } from "next/server";
import { isLocale, type Locale, DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/config";
import { buildSystemPrompt } from "@/lib/chatbot/knowledge";
import { CATEGORIES } from "@/lib/mockData";
import { getCategoriesWithPricing } from "@/lib/bike-pricing";
import { appendConversation, getOwnerKnowledge } from "@/lib/chat-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sonnet 5: prices are treated as BINDING, and the failure mode was always
// arithmetic / tier-selection reasoning, not knowledge or language — Sonnet is
// markedly more reliable there. The large static system prompt is cached (see
// below) so the input cost stays low despite the bigger model.
const MODEL = "claude-sonnet-5";
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
  // Static files under /docs (hosted PDFs) are real assets — pass through. The
  // agreement exists once per site language; an invented code (e.g. "cz", "nl")
  // would 404, so it falls back to the page language.
  if (rest[0] === "docs") {
    const agreement = rest.length === 2 ? /^sickmotos-rental-agreement-([a-z]+)\.pdf$/.exec(rest[1]) : null;
    if (agreement && !(LOCALES as readonly string[]).includes(agreement[1])) {
      return `${SITE}/docs/sickmotos-rental-agreement-${locale}.pdf${hash}`;
    }
    return `${SITE}/${rest.join("/")}${hash}`;
  }
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

// House style: no long dashes in anything a customer reads. The prompt asks
// for it, this makes it hold even when the model slips. A plain hyphen, never
// a comma: "30 – 50 €" is a price range and must stay one.
function replaceLongDashes(text: string): string {
  return text.replace(/[–—]/g, "-");
}

// A reply that hit max_tokens ends mid-word. Cut it back to the last complete
// sentence or line so the customer never sees a broken fragment. A sentence
// end needs two letters before it (French may put a space before ?/!) and a
// new sentence after it (not lowercase, not a digit), so "31.", "z. B.",
// "ca. 25", "bzw. direkt" or a cut-off "rentamotozadar." don't count.
function trimCutReply(text: string): string {
  const ends = [...text.matchAll(/(?<=[^\d\s.]{2} ?)[.!?](?=\s+[^\p{Ll}\d])|\n/gu)].map((m) => (m.index ?? 0) + 1);
  const cut = ends.length ? ends[ends.length - 1] : 0;
  return cut > text.length * 0.4 ? text.slice(0, cut).trim() : text;
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

  let body: { message?: unknown; history?: unknown; locale?: unknown; conversationId?: unknown };
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

  // Merge Thomas's current admin price overrides (same source the website
  // uses) so the bot quotes live, binding prices — not the stale mockData base.
  const categories = await getCategoriesWithPricing();
  // Thomas's merged corrections (admin, /admin/chats) are layered on top of
  // the base knowledge with the highest priority. Empty string when none.
  const ownerKnowledge = await getOwnerKnowledge();
  const system = buildSystemPrompt(locale, categories, ownerKnowledge);
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : null;
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
        // 500 cut two-part answers off mid-word once the FAQ grew (2026-10).
        max_tokens: 900,
        // Cache the big static system prompt (FAQ + fleet + tours + pricing
        // rules). It's identical across requests for a given locale/price set,
        // so repeat requests within the 5-min TTL only pay ~10% of the input
        // cost — keeps Sonnet cheap. Prompt caching is GA (no beta header).
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
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
      stop_reason?: string;
    };
    const raw = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    const text = replaceLongDashes(data.stop_reason === "max_tokens" ? trimCutReply(raw) : raw);
    if (!text) {
      return NextResponse.json(
        { error: "empty", message: "Sorry, I don't have an answer for that. Please contact us on WhatsApp." },
        { status: 502 },
      );
    }
    const reply = sanitizeInternalLinks(text, locale);
    // Log the exchange for the admin chat view AFTER responding, so a slow or
    // failing log can never delay or break the customer's answer.
    const convId = conversationId && /^[a-z0-9-]{6,40}$/.test(conversationId)
      ? conversationId
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    after(() =>
      appendConversation(
        convId,
        [
          { role: "user", content: message, at: now },
          { role: "assistant", content: reply, at: Date.now() },
        ],
        locale,
      ),
    );
    return NextResponse.json({ reply, conversationId: convId });
  } catch (err) {
    console.error("[/api/chatbot] network", err);
    return NextResponse.json(
      { error: "network", message: "The chatbot couldn't be reached. Please try again." },
      { status: 502 },
    );
  }
}
