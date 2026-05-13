"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

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
              {BRAND.contacts.map((contact, i) => (
                <div
                  key={i}
                  className="bg-sand px-5 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 bg-ink flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-ink text-sm flex items-center gap-2">
                        {contact.label}
                        <span className="text-base leading-none">
                          {contact.languages.join(" ")}
                        </span>
                      </p>
                      <p className="text-muted text-sm truncate">{contact.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href={`tel:+${contact.phoneRaw}`}
                      className="flex items-center justify-center gap-1.5 bg-ink text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2.5 hover:bg-red transition-colors"
                    >
                      {dict.footer.call}
                    </a>
                    <a
                      href={`https://wa.me/${contact.phoneRaw}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 bg-[#25D366] text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2.5 hover:bg-[#1EBD5A] transition-colors"
                    >
                      {dict.footer.whatsapp}
                    </a>
                  </div>
                </div>
              ))}

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
        </div>
      </main>
      <Footer lang={lang} t={dict.footer} nav={dict.nav} />
    </>
  );
}
