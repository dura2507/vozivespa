"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FAQ_ITEMS, BRAND } from "@/lib/mockData";

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink/8 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left py-5 flex items-start gap-4 group"
      >
        <span
          className={`mt-0.5 w-5 h-5 flex items-center justify-center shrink-0 transition-all duration-200 ${
            open ? "bg-red text-white" : "border border-ink/20 text-ink/40 group-hover:border-red group-hover:text-red"
          }`}
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        <span className={`font-semibold text-sm transition-colors ${open ? "text-red" : "text-ink group-hover:text-red"}`}>
          {question}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-[32rem] pb-5" : "max-h-0"
        }`}
      >
        <p className="text-muted text-sm leading-relaxed pl-9">{answer}</p>
      </div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24 pb-24 md:pb-16 px-5 md:px-12 min-h-screen">
        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <div className="mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
              Got questions?
            </p>
            <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,7rem)] leading-none tracking-tight text-ink">
              FAQ
            </h1>
          </div>

          {/* Accordion */}
          <div className="bg-white border border-ink/8 px-6 mb-10">
            {FAQ_ITEMS.map((item) => (
              <Accordion key={item.question} {...item} />
            ))}
          </div>

          {/* Still have questions? */}
          <div className="bg-sand px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="font-barlow font-bold uppercase text-xl tracking-tight text-ink mb-1">
                Still have a question?
              </h2>
              <p className="text-muted text-sm">
                Message us via WhatsApp or the contact form — we reply fast.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href="/contact"
                className="border border-ink/20 text-ink font-bold text-xs tracking-widest uppercase px-6 py-3 hover:border-red hover:text-red transition-colors text-center"
              >
                Contact
              </Link>
              <a
                href={`https://wa.me/${BRAND.phoneRaw}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] text-white font-bold text-xs tracking-widest uppercase px-6 py-3 hover:bg-[#1EBD5A] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
