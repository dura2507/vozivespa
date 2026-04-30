"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  const inputClass =
    "mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white placeholder-ink/25 focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all";

  return (
    <>
      <Navbar />
      <main className="pt-24 pb-24 md:pb-16 px-5 md:px-12 min-h-screen">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
              We&apos;d love to hear from you
            </p>
            <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,7rem)] leading-none tracking-tight text-ink">
              Contact
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

            {/* Contact info */}
            <div className="flex flex-col gap-4">
              <a
                href="https://wa.me/385912345678"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-5 bg-[#25D366]/10 border border-[#25D366]/20 px-5 py-5 hover:bg-[#25D366]/15 transition-colors group"
              >
                <div className="w-12 h-12 bg-[#25D366] flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-ink text-sm">WhatsApp</p>
                  <p className="text-muted text-sm">+385 91 234 5678</p>
                  <p className="text-[#25D366] text-xs font-semibold mt-0.5 group-hover:underline">Chat now →</p>
                </div>
              </a>

              <a
                href="tel:+385912345678"
                className="flex items-center gap-5 bg-sand px-5 py-5 hover:bg-sand/80 transition-colors"
              >
                <div className="w-12 h-12 bg-red/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-ink text-sm">Phone</p>
                  <p className="text-muted text-sm">+385 91 234 5678</p>
                </div>
              </a>

              <a
                href="mailto:info@vozivespa.com"
                className="flex items-center gap-5 bg-sand px-5 py-5 hover:bg-sand/80 transition-colors"
              >
                <div className="w-12 h-12 bg-red/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-ink text-sm">Email</p>
                  <p className="text-muted text-sm">info@vozivespa.com</p>
                </div>
              </a>

              <div className="flex items-center gap-5 bg-sand px-5 py-5">
                <div className="w-12 h-12 bg-red/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-ink text-sm">Location</p>
                  <p className="text-muted text-sm">Zadar, Croatia</p>
                  <p className="text-muted text-xs">Exact address confirmed on booking</p>
                </div>
              </div>
            </div>

            {/* Contact form */}
            <div>
              {sent ? (
                <div className="bg-sand px-8 py-12 text-center">
                  <div className="text-5xl mb-5">🛵</div>
                  <h3 className="font-barlow font-black uppercase text-3xl tracking-tight text-ink mb-2">
                    Message Sent!
                  </h3>
                  <p className="text-muted text-sm">
                    Thanks {form.name}! We&apos;ll get back to you as soon as possible.
                  </p>
                </div>
              ) : (
                <div className="bg-sand px-6 py-8">
                  <h2 className="font-barlow font-bold uppercase text-xl tracking-tight text-ink mb-6">
                    Send a Message
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        Name *
                      </span>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your name"
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        Email *
                      </span>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="your@email.com"
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        Message *
                      </span>
                      <textarea
                        required
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="How can we help you?"
                        rows={5}
                        className={`${inputClass} resize-none`}
                      />
                    </label>

                    <button
                      type="submit"
                      className="w-full py-4 bg-red text-white font-bold text-xs tracking-widest uppercase hover:bg-red-dark transition-colors"
                    >
                      Send Message
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
