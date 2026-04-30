"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format, differenceInCalendarDays } from "date-fns";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppMockup from "@/components/WhatsAppMockup";
import { CATEGORIES, BLOCKED_BY_ID, BRAND } from "@/lib/mockData";

type Step = 1 | 2 | 3 | 4;

type FormData = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

const BIKE_CATEGORIES = CATEGORIES;

function StepIndicator({ step }: { step: Step }) {
  const steps = ["Choose", "Dates", "Details", "Done"];
  return (
    <div className="flex items-center justify-center gap-0 mb-12">
      {steps.map((label, i) => {
        const s = (i + 1) as Step;
        const active = s === step;
        const done = s < step;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 flex items-center justify-center text-xs font-bold transition-all ${
                  done
                    ? "bg-red text-white"
                    : active
                    ? "bg-ink text-white"
                    : "bg-off-white border border-ink/15 text-ink/25"
                }`}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s
                )}
              </div>
              <span
                className={`text-[9px] font-bold tracking-[0.15em] uppercase hidden sm:block ${
                  active ? "text-ink" : done ? "text-red" : "text-ink/25"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-12 sm:w-20 h-px mb-5 mx-1 transition-all ${
                  done ? "bg-red" : "bg-ink/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingsPage() {
  const [step, setStep] = useState<Step>(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const blockedDates = selectedCategory ? (BLOCKED_BY_ID[selectedCategory] ?? []) : [];

  const selectedCat = BIKE_CATEGORIES.find((c) => c.id === selectedCategory);
  const categoryLabel = selectedCat?.name ?? "";

  const nights =
    range?.from && range?.to
      ? differenceInCalendarDays(range.to, range.from)
      : 0;

  const pricePerDay = selectedCat ? parseInt(selectedCat.price, 10) : 0;
  const totalPrice = nights * pricePerDay;
  const bookingFee = Math.round(totalPrice * 0.2 * 100) / 100;

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep(4);
  }

  const inputClass =
    "mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white placeholder-ink/25 focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all";

  return (
    <>
      <Navbar />

      <main className="pt-28 pb-24 md:pb-16 px-5 md:px-12 min-h-screen">
        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <div className="mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
              Reserve your ride
            </p>
            <h1 className="font-barlow font-black uppercase text-[clamp(3rem,10vw,6rem)] leading-none tracking-tight text-ink">
              Book a Bike
            </h1>
            <p className="text-muted mt-3 text-sm">
              Pick your bike, select dates, and we&apos;ll confirm via WhatsApp within minutes.
            </p>
          </div>

          <StepIndicator step={step} />

          {/* ── Step 1: Choose category ── */}
          {step === 1 && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {BIKE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setRange(undefined);
                      setStep(2);
                    }}
                    className="group relative overflow-hidden text-left"
                  >
                    <div className="relative aspect-[4/3]">
                      <Image
                        src={cat.image}
                        alt={cat.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 640px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute top-4 left-4">
                        <span className="bg-red text-white text-[10px] font-bold tracking-[0.15em] uppercase px-2.5 py-1">
                          {cat.tag}
                        </span>
                      </div>
                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                        <p className="font-barlow font-black uppercase text-white text-2xl tracking-tight leading-none">
                          {cat.name}
                        </p>
                        <p className="font-barlow font-bold text-white text-xl">
                          {cat.price}<span className="text-sm text-white/60">{cat.priceUnit}</span>
                        </p>
                      </div>
                    </div>
                    <div className="bg-sand px-4 py-3 flex items-center justify-between">
                      <p className="text-xs text-muted leading-relaxed line-clamp-1">{cat.description}</p>
                      <span className="text-red font-bold text-xs tracking-widest uppercase shrink-0 ml-3 flex items-center gap-1">
                        Select
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 bg-sand px-5 py-4 flex gap-3 items-start border-l-2 border-red">
                <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="font-semibold text-ink text-sm">
                    Add-ons available
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    In-ear navigation, premium helmets, secret locations map — mention in the notes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Calendar ── */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => setStep(1)}
                  className="text-ink/40 hover:text-red transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="font-barlow font-bold uppercase text-2xl tracking-tight text-ink">
                  Select dates — {categoryLabel}
                </h2>
              </div>

              <div className="flex flex-wrap gap-5 text-xs text-muted mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red" />
                  Selected
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-ink/15" />
                  Unavailable
                </div>
              </div>

              <div className="bg-white border border-ink/8 p-4 sm:p-6 overflow-x-auto">
                <DayPicker
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={isMobile ? 1 : 2}
                  disabled={[
                    { before: new Date() },
                    ...blockedDates,
                  ]}
                  classNames={{
                    root: "font-sans",
                    months: "flex flex-col sm:flex-row gap-6",
                    month_caption: "flex items-center justify-center mb-4",
                    caption_label: "font-barlow font-bold uppercase tracking-wide text-ink text-base",
                    nav: "flex items-center gap-1",
                    button_previous:
                      "w-8 h-8 flex items-center justify-center text-ink/40 hover:text-red transition-colors",
                    button_next:
                      "w-8 h-8 flex items-center justify-center text-ink/40 hover:text-red transition-colors",
                    month_grid: "w-full border-collapse",
                    weekdays: "mb-2",
                    weekday: "text-[10px] font-bold tracking-widest text-ink/30 text-center py-1 w-9 uppercase",
                    week: "",
                    day: "text-center p-0.5",
                    day_button:
                      "w-9 h-9 text-sm font-medium text-ink transition-colors hover:bg-red/10 cursor-pointer",
                    selected:
                      "bg-red text-white hover:bg-red",
                    range_start: "bg-red text-white",
                    range_end: "bg-red text-white",
                    range_middle:
                      "bg-red/15 text-ink",
                    today: "font-bold text-red",
                    outside: "text-ink/20",
                    disabled: "text-ink/20 cursor-not-allowed hover:bg-transparent line-through",
                    hidden: "invisible",
                  }}
                />
              </div>

              {range?.from && (
                <div className="mt-4 bg-sand px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-ink">
                    <span className="font-semibold">
                      {format(range.from, "dd MMM")}
                    </span>
                    {range.to && (
                      <>
                        {" — "}
                        <span className="font-semibold">
                          {format(range.to, "dd MMM yyyy")}
                        </span>
                        <span className="text-muted ml-2">
                          ({nights} {nights === 1 ? "day" : "days"})
                        </span>
                      </>
                    )}
                  </div>
                  {nights > 0 && (
                    <div className="font-barlow font-black text-red text-2xl">
                      {totalPrice}€
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button
                  disabled={!range?.from || !range?.to || nights === 0}
                  onClick={() => setStep(3)}
                  className="bg-red text-white font-bold text-xs tracking-widest uppercase px-8 py-4 hover:bg-red-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Form ── */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => setStep(2)}
                  className="text-ink/40 hover:text-red transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="font-barlow font-bold uppercase text-2xl tracking-tight text-ink">
                  Your Details
                </h2>
              </div>

              {/* Summary strip */}
              <div className="bg-ink text-white px-5 py-4 mb-7 flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">Bike</p>
                  <p className="font-semibold mt-0.5">{categoryLabel}</p>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">From</p>
                  <p className="font-semibold mt-0.5">
                    {range?.from ? format(range.from, "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">To</p>
                  <p className="font-semibold mt-0.5">
                    {range?.to ? format(range.to, "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div className="ml-auto">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">Total</p>
                  <p className="font-barlow font-black text-red text-2xl leading-none mt-0.5">{totalPrice}€</p>
                </div>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <label className="block">
                    <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                      Full Name *
                    </span>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Max Mustermann"
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
                      placeholder="max@example.com"
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                    WhatsApp / Phone *
                  </span>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+49 170 1234567"
                    className={inputClass}
                  />
                  <p className="text-muted text-xs mt-1.5">
                    We&apos;ll confirm via WhatsApp.
                  </p>
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                    Notes (optional)
                  </span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="E.g. need 2 helmets, in-ear navigation, premium helmet, delivery to hotel..."
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                </label>

                <button
                  type="submit"
                  className="w-full py-4 bg-red text-white font-bold text-xs tracking-widest uppercase hover:bg-red-dark transition-colors"
                >
                  Send Request →
                </button>

                <p className="text-center text-muted text-xs">
                  No payment required. We&apos;ll confirm availability via WhatsApp.
                </p>
              </form>
            </div>
          )}

          {/* ── Step 4: Success ── */}
          {step === 4 && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-[#25D366]/10 mb-6">
                <svg className="w-10 h-10 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>

              <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,8vw,5rem)] leading-none tracking-tight text-ink mb-3">
                Request Sent!
              </h2>
              <p className="text-muted mb-2">
                Got it, {form.name}! The owner will confirm via WhatsApp shortly.
              </p>
              <p className="text-muted text-sm mb-10">
                Here&apos;s a preview of what they receive:
              </p>

              {range?.from && range?.to && (
                <WhatsAppMockup
                  category={categoryLabel}
                  range={range as { from: Date; to: Date }}
                  name={form.name}
                  phone={form.phone}
                  notes={form.notes}
                />
              )}

              <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    setStep(1);
                    setSelectedCategory(null);
                    setRange(undefined);
                    setForm({ name: "", email: "", phone: "", notes: "" });
                  }}
                  className="border border-ink/20 text-ink font-bold text-xs tracking-widest uppercase px-7 py-3 hover:border-red hover:text-red transition-colors"
                >
                  Another Booking
                </button>
                <Link
                  href="/"
                  className="bg-ink text-white font-bold text-xs tracking-widest uppercase px-7 py-3 hover:bg-red transition-colors"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
