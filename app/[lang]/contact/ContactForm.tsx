"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Flag, type FlagCode } from "@/components/Flag";

export default function ContactForm({
  lang,
  dict,
}: {
  lang: Locale;
  dict: Dictionary;
}) {
  const t = dict.contact;
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  // WhatsApp / phone are a LAST-RESORT escalation (Thomas): keep them out of
  // sight at first so visitors use the assistant or the form, then reveal them
  // at the bottom after ~30s for anyone who still wants a human.
  const [showDirect, setShowDirect] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowDirect(true), 30000);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, locale: lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : t.form.error);
        return;
      }
      setSent(true);
    } catch {
      setError(t.form.error);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white placeholder-ink/25 focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all";

  return (
    <>
      <Navbar lang={lang} t={dict.nav} />
      <main className="pt-32 pb-24 md:pb-16 px-5 md:px-12 min-h-screen">
        <div className="max-w-5xl mx-auto">

          <div className="mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
              {t.eyebrow}
            </p>
            <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,7rem)] leading-none tracking-tight text-ink">
              {t.title}
            </h1>
            <p className="mt-4 text-muted text-base leading-relaxed max-w-2xl">{t.intro}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

            <div className="flex flex-col gap-4">
              {/* Primary path: steer the visitor into the assistant conversation
                  (Thomas wants the conversion to happen in the bot). */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("open-chatbot"))}
                className="bg-ink text-white text-left flex items-start gap-4 px-5 py-5 w-full hover:bg-red transition-colors group"
              >
                <div className="w-12 h-12 bg-white/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.87 9.87 0 01-4-.8L3 21l1.3-4A7.94 7.94 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm">{dict.chatbot.title}</p>
                  <p className="text-white/60 text-xs mt-0.5 leading-snug">{dict.chatbot.subtitle}</p>
                  <p className="text-[10px] tracking-[0.15em] uppercase font-bold mt-2 group-hover:underline">{dict.chatbot.openLabel} →</p>
                </div>
              </button>

              <div className="bg-sand overflow-hidden">
                <a
                  href={BRAND.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-5 px-5 py-5 hover:bg-sand/70 transition-colors group"
                >
                  <div className="w-12 h-12 bg-red/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-ink text-sm">{t.address}</p>
                    <p className="text-muted text-sm group-hover:text-ink transition-colors">
                      {BRAND.address}
                    </p>
                    <p className="text-muted text-xs mt-1">{t.openHours}: {BRAND.hours}</p>
                    <p className="text-red text-[10px] tracking-[0.15em] uppercase font-bold mt-2 group-hover:underline">
                      {t.getDirections} →
                    </p>
                  </div>
                </a>
                <iframe
                  title="Google Maps"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(BRAND.address)}&z=15&output=embed`}
                  className="w-full h-56 border-0 block"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            <div>
              {sent ? (
                <div className="bg-sand px-8 py-12 text-center">
                  <div className="font-barlow font-black text-red text-6xl mb-3 leading-none">✓</div>
                  <p className="text-muted text-sm">
                    {t.form.sent}
                  </p>
                </div>
              ) : (
                <div className="bg-sand px-6 py-8">
                  <h2 className="font-barlow font-bold uppercase text-xl tracking-tight text-ink mb-6">
                    {t.form.send}
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {t.form.name} *
                      </span>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {t.form.email} *
                      </span>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        Phone
                      </span>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => {
                          let v = e.target.value;
                          if (v && !v.startsWith("+")) v = "+" + v.replace(/^\++/, "");
                          setForm({ ...form, phone: v });
                        }}
                        onFocus={(e) => {
                          if (!form.phone) setForm({ ...form, phone: "+" });
                          const el = e.target;
                          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
                        }}
                        pattern="^\+[0-9 ]{6,}$|^$"
                        placeholder="+49 170 1234567"
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {t.form.message} *
                      </span>
                      <textarea
                        required
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder={t.form.messagePlaceholder}
                        rows={5}
                        className={`${inputClass} resize-none`}
                      />
                    </label>

                    {error && (
                      <p className="text-red text-sm font-semibold text-center">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-4 bg-red text-white font-bold text-xs tracking-widest uppercase hover:bg-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? t.form.sending : t.form.send}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {showDirect && (
            <div className="mt-12 pt-8 border-t border-ink/10">
              <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-4">
                {t.directContact}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {BRAND.contacts.map((contact, i) => (
                  <div key={i} className="bg-sand px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-ink text-sm flex items-center gap-2">
                        {contact.label}
                        <span className="flex gap-1 leading-none">
                          {contact.languages.map((c) => (
                            <Flag key={c} code={c as FlagCode} className="w-4 h-3" />
                          ))}
                        </span>
                      </p>
                      <p className="text-muted text-xs truncate">{contact.phone}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a
                        href={`tel:+${contact.phoneRaw}`}
                        className="flex items-center justify-center bg-ink text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2.5 hover:bg-red transition-colors"
                      >
                        {dict.footer.call}
                      </a>
                      <a
                        href={`https://wa.me/${contact.phoneRaw}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center bg-[#25D366] text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2.5 hover:bg-[#1EBD5A] transition-colors"
                      >
                        {dict.footer.whatsapp}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer lang={lang} t={dict.footer} nav={dict.nav} />
    </>
  );
}
