import Link from "next/link";
import { revalidatePath } from "next/cache";
import { listInbox, markDone, monitorBotToken, type InboxRow } from "@/lib/telegram-inbox";

export const dynamic = "force-dynamic";

async function setDone(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const done = formData.get("done") === "1";
  if (Number.isFinite(id)) await markDone([id], done);
  revalidatePath("/admin/telegram");
}

async function setAllDone(formData: FormData) {
  "use server";
  const ids = String(formData.get("ids") || "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  if (ids.length) await markDone(ids, true);
  revalidatePath("/admin/telegram");
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", {
    timeZone: "Europe/Zagreb",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const KIND_LABEL: Record<string, string> = {
  photo: "Photo",
  voice: "Voice memo",
  audio: "Audio",
  video: "Video",
  document: "File",
  other: "Message",
};

function kindLabel(kind: string): string | null {
  const base = kind.replace(/^edit:/, "");
  const label = KIND_LABEL[base] ?? null;
  return kind.startsWith("edit:") ? `edited${label ? " · " + label : ""}` : label;
}

export default async function TelegramInbox({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showAll = filter === "all";
  const configured = !!monitorBotToken();
  let rows: InboxRow[] = [];
  let loadError = false;
  if (configured) {
    try {
      rows = await listInbox({ onlyOpen: !showAll, limit: 300 });
    } catch {
      loadError = true;
    }
  }
  const openIds = rows.filter((r) => !r.done).map((r) => r.update_id);

  // Group by day so a busy week stays scannable.
  const groups: Array<{ day: string; rows: InboxRow[] }> = [];
  for (const r of rows) {
    const day = dayKey(r.sent_at ?? r.received_at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(r);
    else groups.push({ day, rows: [r] });
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <h1 className="font-barlow font-bold uppercase tracking-wide text-2xl text-ink">
          Group inbox
        </h1>
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-[0.15em]">
          <Link href="/admin/telegram" className={!showAll ? "text-red" : "text-ink/50 hover:text-ink"}>
            Open{!showAll ? ` (${rows.length})` : ""}
          </Link>
          <Link href="/admin/telegram?filter=all" className={showAll ? "text-red" : "text-ink/50 hover:text-ink"}>
            All
          </Link>
          {openIds.length > 1 && (
            <form action={setAllDone}>
              <input type="hidden" name="ids" value={openIds.join(",")} />
              <button
                type="submit"
                className="px-3 py-1.5 border border-ink/15 text-ink/60 hover:text-ink transition-colors"
              >
                Mark all done
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="text-xs text-muted mb-6">
        Every message from the Telegram group &ldquo;Monitoring RentAMoto&rdquo; (and private
        messages to the monitoring bot) lands here. Tick off what has been handled.
      </p>

      {!configured && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 mb-4 text-sm text-red-800">
          TELEGRAM_MONITOR_BOT_TOKEN is not set in Vercel yet, so the inbox is inactive.
        </div>
      )}
      {loadError && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 mb-4 text-sm text-red-800">
          The inbox can&apos;t be loaded right now (store error).
        </div>
      )}

      {configured && !loadError && rows.length === 0 && (
        <div className="bg-white border border-dashed border-ink/15 p-10 text-center text-sm text-muted">
          {showAll ? "No messages yet." : "Nothing open. All caught up."}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.day} className="mb-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40 mb-2">{g.day}</h2>
          <ul className="bg-white border border-ink/10 divide-y divide-ink/10">
            {g.rows.map((r) => {
              const kl = kindLabel(r.kind);
              return (
                <li
                  key={r.update_id}
                  className={`flex items-start gap-3 px-4 py-3.5 ${r.done ? "opacity-50" : ""}`}
                >
                  <span
                    className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${r.done ? "bg-ink/15" : "bg-red"}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted">
                      <span className="font-semibold text-ink">{r.from_name ?? "?"}</span>
                      {" · "}
                      {fmt(r.sent_at ?? r.received_at)}
                      {r.chat_type === "private" ? " · private" : r.chat_title ? ` · ${r.chat_title}` : ""}
                      {kl ? ` · ${kl}` : ""}
                    </p>
                    {r.text && <p className="text-sm text-ink whitespace-pre-wrap mt-0.5">{r.text}</p>}
                    {r.file_id && (
                      <a
                        href={`/api/admin/telegram-file?id=${encodeURIComponent(r.file_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1.5 text-xs font-bold uppercase tracking-[0.15em] text-red hover:underline"
                      >
                        Open {kl?.toLowerCase() ?? "file"} →
                      </a>
                    )}
                  </div>
                  <form action={setDone}>
                    <input type="hidden" name="id" value={r.update_id} />
                    <input type="hidden" name="done" value={r.done ? "0" : "1"} />
                    <button
                      type="submit"
                      className={`text-[10px] font-bold uppercase tracking-[0.15em] px-3 py-1.5 border transition-colors ${
                        r.done
                          ? "border-ink/15 text-ink/40 hover:text-ink"
                          : "border-red bg-red text-white hover:bg-red-dark"
                      }`}
                    >
                      {r.done ? "Reopen" : "Done"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
