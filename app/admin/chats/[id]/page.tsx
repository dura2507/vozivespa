import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  applyCorrection,
  getConversation,
  markReviewed,
  saveNote,
} from "@/lib/chat-log";

export const dynamic = "force-dynamic";
// Submitting a correction runs a synchronous Haiku merge of the whole
// knowledge doc; give the server action room beyond the default timeout.
export const maxDuration = 60;

async function toggleReviewed(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await markReviewed(id, formData.get("reviewed") === "1");
  revalidatePath(`/admin/chats/${id}`);
  revalidatePath("/admin/chats");
}

async function updateNote(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await saveNote(id, String(formData.get("note") || ""));
  revalidatePath(`/admin/chats/${id}`);
}

async function submitCorrection(formData: FormData) {
  "use server";
  const chatId = String(formData.get("chatId"));
  const correction = String(formData.get("correction") || "").trim();
  if (!correction) return;
  await applyCorrection({
    chatId,
    question: String(formData.get("question") || ""),
    wrongAnswer: String(formData.get("wrongAnswer") || "") || undefined,
    correction,
  });
  revalidatePath(`/admin/chats/${chatId}`);
}

function fmtTime(at: number): string {
  return new Date(at).toLocaleString("de-DE", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputClass =
  "mt-1 w-full border border-ink/15 px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red";

export default async function AdminChatDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (conv === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 bg-red-50 border border-red-200 text-sm text-red-800">
        This chat can&apos;t be loaded right now (store error).
      </div>
    );
  }
  if (!conv) notFound();

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <Link
          href="/admin/chats"
          className="text-xs font-bold uppercase tracking-[0.15em] text-ink/50 hover:text-ink"
        >
          ← All chats
        </Link>
        <form action={toggleReviewed}>
          <input type="hidden" name="id" value={conv.id} />
          <input type="hidden" name="reviewed" value={conv.reviewed ? "0" : "1"} />
          <button
            type="submit"
            className={`text-xs font-bold uppercase tracking-[0.15em] px-4 py-2 border transition-colors ${
              conv.reviewed
                ? "border-ink/15 text-ink/50 hover:text-ink"
                : "border-red bg-red text-white hover:bg-red-dark"
            }`}
          >
            {conv.reviewed ? "Mark as unread" : "Mark as read"}
          </button>
        </form>
      </div>

      <p className="text-xs text-muted mb-4">
        {conv.messages.length} messages · locale {conv.locale ?? "?"} · started{" "}
        {fmtTime(new Date(conv.created_at).getTime())} (Zadar time)
      </p>

      <div className="space-y-3 mb-8">
        {conv.messages.map((m, i) => (
          <div
            key={i}
            className={`px-4 py-3 text-sm whitespace-pre-wrap border ${
              m.role === "user"
                ? "bg-white border-ink/10"
                : "bg-ink/[0.04] border-ink/10 ml-6"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40 mb-1">
              {m.role === "user" ? "Customer" : "Bot"} · {fmtTime(m.at)}
            </p>
            {m.content}
          </div>
        ))}
      </div>

      <div className="bg-white border border-ink/10 p-4 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-ink/50 mb-2">
          Note
        </h2>
        <form action={updateNote} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={conv.id} />
          <textarea name="note" rows={2} defaultValue={conv.note ?? ""} className={inputClass} />
          <button
            type="submit"
            className="self-start text-xs font-bold uppercase tracking-[0.15em] px-4 py-2 border border-ink/15 text-ink/60 hover:text-ink transition-colors"
          >
            Save note
          </button>
        </form>
      </div>

      <div className="bg-white border border-ink/10 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-ink/50 mb-1">
          Correct the bot
        </h2>
        <p className="text-xs text-muted mb-3">
          The correction is merged into the bot&apos;s private knowledge and applied to
          every future answer, with priority over the built-in FAQ.
        </p>
        <form action={submitCorrection} className="flex flex-col gap-3">
          <input type="hidden" name="chatId" value={conv.id} />
          <label className="block text-xs text-ink/60">
            Customer question (copy it from above)
            <input type="text" name="question" className={inputClass} />
          </label>
          <label className="block text-xs text-ink/60">
            Wrong bot answer (optional)
            <input type="text" name="wrongAnswer" className={inputClass} />
          </label>
          <label className="block text-xs text-ink/60">
            Correct answer / rule *
            <textarea name="correction" rows={3} required className={inputClass} />
          </label>
          <button
            type="submit"
            className="self-start text-xs font-bold uppercase tracking-[0.15em] px-5 py-2.5 bg-red text-white hover:bg-red-dark transition-colors"
          >
            Save correction
          </button>
        </form>
      </div>
    </div>
  );
}
