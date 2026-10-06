import "server-only";
import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase";

// Telegram group inbox for the Krileo monitoring bot (2026-10-06).
//
// Why: the group was read with getUpdates from two machines. Telegram hands
// every update out exactly once and forgets it after 24 h, so whichever
// machine polled first "ate" the messages and the other saw nothing - three
// times in a row. A webhook delivers every message to the site, which stores
// it in Supabase; both machines read the table, nothing expires, and the owner
// gets an inbox with an "Erledigt" state in the admin.
//
// Secret: the webhook's X-Telegram-Bot-Api-Secret-Token is DERIVED from the
// bot token (sha256), so exactly one env var is needed
// (TELEGRAM_MONITOR_BOT_TOKEN) and the secret never has to be pasted anywhere.
// The same derived value authenticates the read/done endpoints used from the
// terminal, so reading the inbox needs the bot token - the same trust level as
// polling getUpdates used to need.

export type InboxRow = {
  update_id: number;
  received_at: string;
  sent_at: string | null;
  chat_id: number | null;
  chat_title: string | null;
  chat_type: string | null;
  from_name: string | null;
  message_id: number | null;
  kind: string;
  text: string | null;
  file_id: string | null;
  done: boolean;
  done_at: string | null;
};

export function monitorBotToken(): string | null {
  const t = process.env.TELEGRAM_MONITOR_BOT_TOKEN;
  return t && t.length > 20 ? t : null;
}

export function monitorSecret(): string | null {
  const t = monitorBotToken();
  if (!t) return null;
  return createHash("sha256").update("monitor-webhook:" + t).digest("hex");
}

// Constant-time compare so a timing probe can't walk the secret.
export function secretMatches(provided: string | null): boolean {
  const want = monitorSecret();
  if (!want || !provided || provided.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

type TgUser = { first_name?: string; last_name?: string; username?: string };
type TgChat = { id: number; type: string; title?: string; first_name?: string };
type TgMessage = {
  message_id: number;
  date: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
  voice?: { file_id: string; duration?: number };
  audio?: { file_id: string };
  document?: { file_id: string; file_name?: string };
  video?: { file_id: string };
  forward_origin?: { type: string; sender_user?: TgUser; sender_user_name?: string; date?: number };
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
};

function whoName(u?: TgUser): string | null {
  if (!u) return null;
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.username || null;
}

// Flatten one update into a row. Returns null for updates without a message
// (we only subscribe to message types, but be defensive).
export function toRow(update: TgUpdate): Omit<InboxRow, "received_at" | "done" | "done_at"> | null {
  const edited = !!update.edited_message;
  const m = update.message ?? update.edited_message ?? update.channel_post;
  if (!m) return null;
  let kind = "text";
  let file_id: string | null = null;
  if (m.photo?.length) { kind = "photo"; file_id = m.photo[m.photo.length - 1].file_id; }
  else if (m.voice) { kind = "voice"; file_id = m.voice.file_id; }
  else if (m.audio) { kind = "audio"; file_id = m.audio.file_id; }
  else if (m.video) { kind = "video"; file_id = m.video.file_id; }
  else if (m.document) { kind = "document"; file_id = m.document.file_id; }
  else if (!m.text) kind = "other";
  if (edited) kind = "edit:" + kind;
  // A private forward (the fallback used when the group was missed) keeps the
  // original sender visible instead of showing the forwarder.
  const fwd = m.forward_origin;
  const fwdName = fwd ? (whoName(fwd.sender_user) ?? fwd.sender_user_name ?? null) : null;
  const from = fwdName ? `${fwdName} (via ${whoName(m.from) ?? "?"})` : whoName(m.from);
  return {
    update_id: update.update_id,
    sent_at: new Date((fwd?.date ?? m.date) * 1000).toISOString(),
    chat_id: m.chat.id,
    chat_title: m.chat.title ?? m.chat.first_name ?? null,
    chat_type: m.chat.type,
    from_name: from,
    message_id: m.message_id,
    kind,
    text: m.text ?? m.caption ?? (m.document?.file_name ? `[${m.document.file_name}]` : null),
    file_id,
  };
}

export async function storeUpdate(update: TgUpdate): Promise<void> {
  const row = toRow(update);
  if (!row) return;
  const supabase = getServiceClient();
  // Idempotent on update_id: Telegram may redeliver after a slow response.
  const { error } = await supabase
    .from("telegram_inbox")
    .upsert({ ...row, raw: update }, { onConflict: "update_id", ignoreDuplicates: true });
  if (error) throw new Error(`telegram_inbox upsert: ${error.message}`);
}

export async function listInbox(opts: { onlyOpen: boolean; limit?: number }): Promise<InboxRow[]> {
  const supabase = getServiceClient();
  let q = supabase
    .from("telegram_inbox")
    .select("update_id, received_at, sent_at, chat_id, chat_title, chat_type, from_name, message_id, kind, text, file_id, done, done_at")
    .order("sent_at", { ascending: false })
    .limit(opts.limit ?? 300);
  if (opts.onlyOpen) q = q.eq("done", false);
  const { data, error } = await q;
  if (error) throw new Error(`telegram_inbox list: ${error.message}`);
  return (data ?? []) as InboxRow[];
}

export async function markDone(updateIds: number[], done: boolean): Promise<number> {
  if (updateIds.length === 0) return 0;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("telegram_inbox")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .in("update_id", updateIds)
    .select("update_id");
  if (error) throw new Error(`telegram_inbox markDone: ${error.message}`);
  return data?.length ?? 0;
}

// Resolve a file_id to a downloadable URL (the bot token is in the URL, so
// this is only ever used server-side by the admin proxy route).
export async function fileDownloadUrl(fileId: string): Promise<string | null> {
  const token = monitorBotToken();
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
  if (!json.ok || !json.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
}
