import Link from "next/link";
import { listConversations } from "@/lib/chat-log";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function AdminChats({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const conversations = await listConversations(200);
  // undefined = the store didn't answer. An empty list would claim there are
  // no chats, which is a different statement.
  const storeOk = conversations !== undefined;
  const all = conversations ?? [];
  const list = filter === "new" ? all.filter((c) => !c.reviewed) : all;
  const unreviewed = all.filter((c) => !c.reviewed).length;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <h1 className="font-barlow font-bold uppercase tracking-wide text-2xl text-ink">
          Bot chats
        </h1>
        <div className="flex gap-4 text-xs font-bold uppercase tracking-[0.15em]">
          <Link
            href="/admin/chats"
            className={filter !== "new" ? "text-red" : "text-ink/50 hover:text-ink"}
          >
            All ({all.length})
          </Link>
          <Link
            href="/admin/chats?filter=new"
            className={filter === "new" ? "text-red" : "text-ink/50 hover:text-ink"}
          >
            Unread ({unreviewed})
          </Link>
        </div>
      </div>

      {!storeOk && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 mb-4 text-sm text-red-800">
          Chats can&apos;t be loaded right now (store error). Check the server logs.
        </div>
      )}

      {list.length === 0 ? (
        <div className="bg-white border border-dashed border-ink/15 p-10 text-center text-sm text-muted">
          {!storeOk
            ? "Chats can't be loaded right now."
            : filter === "new"
              ? "No unread chats."
              : "No chats logged yet."}
        </div>
      ) : (
        <ul className="bg-white border border-ink/10 divide-y divide-ink/10">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/chats/${c.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink/[0.03] transition-colors"
              >
                <span
                  className={`w-2 h-2 shrink-0 rounded-full ${c.reviewed ? "bg-ink/15" : "bg-red"}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{c.preview || "(no text)"}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {c.messages.length} messages · {c.locale ?? "?"} · {timeAgo(c.updated_at)} ago
                  </p>
                </div>
                <span className="text-ink/30">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
