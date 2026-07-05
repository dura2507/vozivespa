"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type Turn = { role: "user" | "assistant"; content: string };

// Small round brand avatar shown in the header and next to each bot reply.
// A red disc with a white chat glyph — reads as "assistant" without needing
// a photo, and matches the site's red/ink palette.
function BotAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      className="shrink-0 rounded-full bg-gradient-to-br from-red to-red-dark flex items-center justify-center text-white shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ width: size * 0.55, height: size * 0.55 }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.87 9.87 0 01-4-.8L3 21l1.3-4A7.94 7.94 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </span>
  );
}

// Renders a message: turns **bold** into real bold and strips any stray
// markdown asterisks so raw ** never shows in a bubble. Everything else stays
// plain text (React escapes it); newlines are kept by the pre-wrap class.
function renderRich(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      return (
        <strong key={i} className="font-semibold">
          {bold[1]}
        </strong>
      );
    }
    return <span key={i}>{part.replace(/\*\*/g, "")}</span>;
  });
}

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
        // Prefer the localised copy over the server's English default so
        // the error reads in the visitor's language.
        const localised =
          data.error === "not_configured"
            ? t.errorNotConfigured
            : data.error === "rate_limited"
              ? t.errorRateLimited
              : t.errorGeneric;
        setError(localised ?? data.message ?? t.errorGeneric);
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
      {/* Floating launcher, bottom-right */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t.close : t.openLabel}
        className={`group fixed z-[60] bottom-5 right-5 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg shadow-red/25 transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-red/30 ${
          open
            ? "bg-ink"
            : "bg-gradient-to-br from-red to-red-dark"
        }`}
      >
        {/* Soft pulse ring while closed, to gently invite a tap. */}
        {!open && (
          <span className="chat-ring absolute inset-0 rounded-full bg-red/40" aria-hidden />
        )}
        <span className="relative">
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
        </span>
      </button>

      {open && (
        <div
          className="chat-pop fixed z-[60] bottom-24 right-5 left-5 sm:left-auto sm:w-[400px] bg-white rounded-3xl shadow-2xl ring-1 ring-ink/10 flex flex-col overflow-hidden"
          style={{ maxHeight: "min(600px, calc(100vh - 13rem))" }}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-ink to-[#2b2b2b] text-white px-4 py-3.5 flex items-center gap-3">
            <div className="relative">
              <BotAvatar size={38} />
              {/* Online dot */}
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-ink" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-tight truncate">{t.title}</p>
              <p className="text-[11px] text-white/55 mt-0.5 leading-snug line-clamp-2">{t.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="shrink-0 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3 text-sm bg-off-white">
            {messages.length === 0 && (
              <div className="chat-msg">
                {/* Greeting bubble with avatar */}
                <div className="flex items-end gap-2">
                  <BotAvatar size={28} />
                  <div className="max-w-[85%] bg-white text-ink px-3.5 py-2.5 rounded-2xl rounded-bl-md shadow-sm ring-1 ring-ink/5 leading-snug">
                    {t.greeting}
                  </div>
                </div>
                {/* Suggestion chips */}
                <div className="mt-3 flex flex-wrap gap-2 pl-9">
                  {t.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDraft(s);
                        inputRef.current?.focus();
                      }}
                      className="text-left text-xs bg-white text-ink/80 border border-ink/10 rounded-full px-3 py-1.5 hover:border-red hover:text-red hover:shadow-sm transition-all"
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
                className={`chat-msg flex items-end gap-2 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "assistant" && <BotAvatar size={28} />}
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 leading-snug whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-red to-red-dark text-white rounded-2xl rounded-br-md shadow-sm shadow-red/20"
                      : "bg-white text-ink rounded-2xl rounded-bl-md shadow-sm ring-1 ring-ink/5"
                  }`}
                >
                  {renderRich(m.content)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="chat-msg flex items-end gap-2 justify-start">
                <BotAvatar size={28} />
                <div className="bg-white rounded-2xl rounded-bl-md shadow-sm ring-1 ring-ink/5 px-4 py-3 flex items-center gap-1">
                  <span className="chat-dot w-1.5 h-1.5 rounded-full bg-ink/40" style={{ animationDelay: "0ms" }} />
                  <span className="chat-dot w-1.5 h-1.5 rounded-full bg-ink/40" style={{ animationDelay: "150ms" }} />
                  <span className="chat-dot w-1.5 h-1.5 rounded-full bg-ink/40" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-center">
                <p className="text-xs text-red font-medium bg-red/5 border border-red/15 rounded-full px-3 py-1.5 text-center">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-ink/10 px-3 py-3 bg-white">
            <div className="flex items-end gap-2">
              <div className="flex-1 flex items-end rounded-2xl bg-off-white border border-ink/10 focus-within:border-red/40 focus-within:ring-2 focus-within:ring-red/20 transition-colors">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={t.placeholder}
                  className="flex-1 resize-none bg-transparent px-3.5 py-2.5 text-sm focus:outline-none max-h-32 placeholder:text-ink/35"
                />
              </div>
              <button
                type="button"
                onClick={send}
                disabled={busy || !draft.trim()}
                aria-label={t.send}
                className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-red to-red-dark text-white flex items-center justify-center shadow-sm shadow-red/25 hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:shadow-none transition-all"
              >
                <svg className="w-5 h-5 -ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.5 4.5a.5.5 0 01.68-.62l15.5 7.2a.5.5 0 010 .9l-15.5 7.2a.5.5 0 01-.68-.62L6 12zm0 0h7" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-ink/35 mt-2 text-center">{t.disclaimer}</p>
          </div>
        </div>
      )}
    </>
  );
}
