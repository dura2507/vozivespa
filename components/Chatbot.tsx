"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type Turn = { role: "user" | "assistant"; content: string };

// Floating chat widget. Mounted once on every page via the [lang] layout.
// The panel opens with a single tap; on mobile it fills a comfortable chunk
// of the screen without going full-screen so the page behind is still
// visible. All strings come from dict.chatbot so translations follow the
// site's language switcher.
export default function Chatbot({ locale, t }: { locale: Locale; t: Dictionary["chatbot"] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the input when the panel opens.
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    // Autoscroll to the latest message when the log changes.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setDraft("");
    setError(null);
    const nextHistory: Turn[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-10),
          locale,
        }),
      });
      const data = (await res.json()) as { reply?: string; message?: string; error?: string };
      if (!res.ok) {
        setError(data.message ?? t.errorGeneric);
        return;
      }
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
      }
    } catch {
      setError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating button, bottom-right */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t.close : t.openLabel}
        className={`fixed z-40 bottom-5 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white transition-all ${
          open ? "bg-ink hover:bg-ink/90" : "bg-red hover:bg-red-dark"
        }`}
      >
        {open ? (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.87 9.87 0 01-4-.8L3 21l1.3-4A7.94 7.94 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed z-40 bottom-24 right-5 left-5 sm:left-auto sm:w-[380px] bg-white shadow-2xl border border-ink/10 flex flex-col overflow-hidden"
          style={{ maxHeight: "min(560px, calc(100vh - 8rem))" }}
        >
          {/* Header */}
          <div className="bg-ink text-white px-4 py-3">
            <p className="font-bold text-sm">{t.title}</p>
            <p className="text-[11px] text-white/60 mt-0.5 leading-snug">{t.subtitle}</p>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm bg-off-white">
            {messages.length === 0 && (
              <div className="text-ink/60 leading-relaxed">
                <p>{t.greeting}</p>
                <div className="mt-3 space-y-1.5">
                  {t.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDraft(s)}
                      className="block text-left text-xs bg-white border border-ink/10 px-3 py-1.5 hover:border-red hover:text-red transition-colors w-full"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 leading-snug whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-red text-white"
                      : "bg-white text-ink border border-ink/10"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-ink/10 px-3 py-2 text-ink/40">
                  <span className="inline-block animate-pulse">•••</span>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-red font-medium">{error}</p>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-ink/10 px-3 py-2 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={t.placeholder}
                className="flex-1 resize-none border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red max-h-32"
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || !draft.trim()}
                className="bg-red text-white font-bold text-xs tracking-widest uppercase px-3 py-2.5 hover:bg-red-dark disabled:opacity-30 shrink-0"
              >
                {t.send}
              </button>
            </div>
            <p className="text-[10px] text-ink/40 mt-1.5">{t.disclaimer}</p>
          </div>
        </div>
      )}
    </>
  );
}
