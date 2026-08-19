import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// Chatbot conversation logging + owner corrections, the same system the
// SickMotos shop admin has (see its adminStore.ts / botCorrections.ts), with
// Supabase as the store instead of Redis because this project already runs on
// Supabase and has no Redis.
//
// Read convention: `undefined` means the store did not answer (outage). null /
// [] mean it answered and there is nothing. Callers must not treat a failed
// read as "no data", or a failed read plus a successful write erases history.

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  at: number; // epoch ms
};

export type ChatConversation = {
  id: string;
  created_at: string;
  updated_at: string;
  messages: StoredMessage[];
  preview: string;
  reviewed: boolean;
  note: string | null;
  locale: string | null;
};

export type BotCorrection = {
  id: string;
  created_at: string;
  chat_id: string | null;
  question: string;
  wrong_answer: string | null;
  correction: string;
};

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortPreview(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}

// Append turns to a conversation (creating it on first use) and return its id.
// Never throws: logging must never take the customer-facing bot down, so every
// failure is logged and swallowed.
export async function appendConversation(
  id: string | null,
  turns: StoredMessage[],
  locale: string,
): Promise<string> {
  const convId = id && /^[a-z0-9-]{6,40}$/.test(id) ? id : makeId();
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("messages, preview")
      .eq("id", convId)
      .maybeSingle<{ messages: StoredMessage[]; preview: string }>();
    // A failed READ must not lead to a write that replaces a real history
    // with a two-line stub. Skip logging this turn instead.
    if (error) {
      console.error("[chat-log] read", error);
      return convId;
    }
    const messages = [...(data?.messages ?? []), ...turns];
    const preview = data?.preview || shortPreview(turns[0]?.content ?? "");
    const { error: upErr } = await supabase.from("chat_conversations").upsert({
      id: convId,
      updated_at: new Date().toISOString(),
      messages,
      preview,
      locale,
    });
    if (upErr) console.error("[chat-log] write", upErr);
  } catch (err) {
    console.error("[chat-log] append", err);
  }
  return convId;
}

export async function listConversations(
  limit = 200,
): Promise<ChatConversation[] | undefined> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[chat-log] list", error);
      return undefined;
    }
    return (data ?? []) as ChatConversation[];
  } catch (err) {
    console.error("[chat-log] list", err);
    return undefined;
  }
}

export async function getConversation(
  id: string,
): Promise<ChatConversation | null | undefined> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle<ChatConversation>();
    if (error) {
      console.error("[chat-log] get", error);
      return undefined;
    }
    return data ?? null;
  } catch (err) {
    console.error("[chat-log] get", err);
    return undefined;
  }
}

export async function markReviewed(id: string, reviewed: boolean): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("chat_conversations")
    .update({ reviewed })
    .eq("id", id);
  if (error) console.error("[chat-log] markReviewed", error);
}

export async function saveNote(id: string, note: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("chat_conversations")
    .update({ note: note || null })
    .eq("id", id);
  if (error) console.error("[chat-log] saveNote", error);
}

// ---------------------------------------------------------------------------
// Owner corrections -> one merged knowledge document, injected into the bot's
// system prompt with the highest priority (see buildSystemPrompt).

export async function getOwnerKnowledge(supabase?: SupabaseClient): Promise<string> {
  try {
    const sb = supabase ?? getServiceClient();
    const { data, error } = await sb
      .from("bot_knowledge")
      .select("content")
      .eq("id", 1)
      .maybeSingle<{ content: string }>();
    if (error) {
      console.error("[chat-log] knowledge read", error);
      return "";
    }
    return data?.content ?? "";
  } catch (err) {
    console.error("[chat-log] knowledge read", err);
    return "";
  }
}

export async function listCorrections(limit = 100): Promise<BotCorrection[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("bot_corrections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[chat-log] corrections list", error);
    return [];
  }
  return (data ?? []) as BotCorrection[];
}

const MERGE_MODEL = "claude-haiku-4-5";

function mergePrompt(
  current: string,
  c: { question: string; wrongAnswer?: string; correction: string },
): string {
  return `You maintain the owner's private correction knowledge for the Rent a Moto Zadar rental chatbot. This document is layered on top of the base knowledge with the HIGHEST priority, so whatever it says overrides the base.

CURRENT DOCUMENT (may be empty):
"""
${current || "(empty)"}
"""

NEW CORRECTION FROM THE OWNER:
- Customer asked: ${c.question || "(unknown)"}
${c.wrongAnswer ? `- The bot wrongly answered: ${c.wrongAnswer}\n` : ""}- The owner says the correct answer / rule is: ${c.correction}

Rewrite and return the FULL updated document following these rules:
- Keep it a concise Markdown document grouped by topic with "## Topic" sections and short bullet rules or Q/A lines.
- If the new correction concerns a topic already present, REPLACE the outdated information with the corrected version. Do not keep the old wrong statement.
- If it is a new topic, add a new bullet or section in the right place.
- CRITICAL, NEVER LOSE INFORMATION: every distinct rule, fact, price, time, link, or model-specific detail already in the current document MUST remain in your output. Do NOT drop, shorten away, or summarize out existing content. The only things you may remove are EXACT duplicates and information the new correction explicitly overrides as outdated.
- Output ONLY the document text, no commentary.`;
}

// Record a correction and merge it into the knowledge doc. Returns an error
// string for the admin UI, or null on success.
export async function applyCorrection(c: {
  chatId?: string;
  question: string;
  wrongAnswer?: string;
  correction: string;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "ANTHROPIC_API_KEY is not configured.";
  const supabase = getServiceClient();

  // Audit trail first - even if the merge fails, the correction is recorded.
  const { error: insErr } = await supabase.from("bot_corrections").insert({
    chat_id: c.chatId ?? null,
    question: c.question,
    wrong_answer: c.wrongAnswer || null,
    correction: c.correction,
  });
  if (insErr) {
    console.error("[chat-log] correction insert", insErr);
    return "Could not save the correction.";
  }

  const current = await getOwnerKnowledge(supabase);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MERGE_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: mergePrompt(current, c) }],
      }),
    });
    if (!res.ok) {
      console.error("[chat-log] merge upstream", res.status, (await res.text()).slice(0, 300));
      return "The correction was saved, but merging it into the bot knowledge failed. Try again.";
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const merged = (data.content ?? [])
      .filter((x) => x.type === "text")
      .map((x) => x.text ?? "")
      .join("")
      .trim();
    if (!merged) return "The correction was saved, but the merge returned nothing. Try again.";
    // Guard against a merge that silently ate the document.
    if (current && merged.length < current.length * 0.5) {
      console.error("[chat-log] merge shrank doc", current.length, "->", merged.length);
      return "The correction was saved, but the merge looked lossy and was not applied. Try again.";
    }
    const { error: upErr } = await supabase
      .from("bot_knowledge")
      .upsert({ id: 1, content: merged, updated_at: new Date().toISOString() });
    if (upErr) {
      console.error("[chat-log] knowledge write", upErr);
      return "The correction was saved, but writing the bot knowledge failed.";
    }
    return null;
  } catch (err) {
    console.error("[chat-log] merge", err);
    return "The correction was saved, but merging it into the bot knowledge failed.";
  }
}
