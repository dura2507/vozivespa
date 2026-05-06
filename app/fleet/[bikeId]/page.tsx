"use client";

import { use, useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format, differenceInCalendarDays } from "date-fns";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppMockup from "@/components/WhatsAppMockup";
import { CATEGORIES, BLOCKED_BY_ID, BRAND } from "@/lib/mockData";

type FormData = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type BookingStep = "dates" | "form" | "done";

export default function BikeDetailPage({
  params,
}: {
  params: Promise<{ bikeId: string }>;
}) {
  const { bikeId } = use(params);
  const bike = CATEGORIES.find((c) => c.id === bikeId);
  if (!bike) notFound();

  const blocked = BLOCKED_BY_ID[bike.id] ?? [];
  const [activeImage, setActiveImage] = useState(bike.image);
  const [range, setRange] = useState<DateRange | undefined>();
  const [bookingStep, setBookingStep] = useState<BookingStep>("dates");
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const formRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const nights =
    range?.from && range?.to ? differenceInCalendarDays(range.to, range.from) : 0;
  const pricePerDay = parseInt(bike.pricing.day, 10) || 0;
  const totalPrice = nights * pricePerDay;
  const bookingFee = Math.round(totalPrice * 0.2 * 100) / 100;

  function scrollToCalendar() {
    calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleContinueToForm() {
    setBookingStep("form");
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBookingStep("done");
    setTimeout(() => {
      successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function resetBooking() {
    setBookingStep("dates");
    setRange(undefined);
    setForm({ name: "", email: "", phone: "", notes: "" });
  }

  const specs: { label: string; value: string }[] = [
    { label: "Engine", value: bike.displacement },
    { label: "Power", value: bike.power },
    { label: "Top Speed", value: bike.maxSpeed },
    { label: "Tank", value: bike.tank },
    { label: "Consumption", value: bike.consumption },
    { label: "Range", value: bike.range },
    { label: "Seats", value: String(bike.seats) },
    { label: "Year", value: bike.year },
  ];

  const tiers: { label: string; sub: string; price: string }[] = [
    { label: "Daily", sub: "1 day", price: bike.pricing.day },
    { label: "Weekend", sub: "Fri – Sun", price: bike.pricing.weekend },
    { label: "Week", sub: "7 days", price: bike.pricing.week },
    { label: "Month", sub: "30 days", price: bike.pricing.month },
  ];

  const inputClass =
    "mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white placeholder-ink/25 focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all";

  return (
    <>
      <Navbar />

      <main className="pt-32 pb-20 md:pb-16 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="mb-6 flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-muted">
            <Link href="/" className="hover:text-red transition-colors">Home</Link>
            <span>/</span>
            <Link href="/#fleet" className="hover:text-red transition-colors">Fleet</Link>
            <span>/</span>
            <span className="text-ink">{bike.model}</span>
          </div>

          {/* Hero — image + title */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
            <div>
              <div className="relative aspect-[4/3] bg-sand overflow-hidden">
                <Image
                  src={activeImage}
                  alt={bike.model}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-red text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5">
                    {bike.tag}
                  </span>
                </div>
                <div className="absolute top-4 right-4 bg-ink/85 backdrop-blur-sm text-white px-3 py-1.5 text-[10px] font-bold tracking-[0.15em] uppercase">
                  {bike.licence}
                </div>
              </div>
              {bike.gallery.length > 1 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {bike.gallery.map((src) => (
                    <button
                      key={src}
                      onClick={() => setActiveImage(src)}
                      className={`relative aspect-square overflow-hidden ${
                        activeImage === src ? "ring-2 ring-red" : "opacity-70 hover:opacity-100"
                      } transition-all`}
                    >
                      <Image src={src} alt="" fill className="object-cover" sizes="120px" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <h1 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.9] tracking-tight text-ink mb-5">
                {bike.model}
              </h1>
              <p className="text-muted text-base leading-relaxed mb-5">
                {bike.longDescription}
              </p>

              <div className="border-l-2 border-red pl-4 py-1 mb-7">
                <p className="text-ink text-sm font-semibold italic">
                  {bike.tagline}
                </p>
              </div>

              <div className="bg-ink text-white p-6 mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  {bike.priceFrom && (
                    <span className="text-white/50 text-xs tracking-widest uppercase mr-1">
                      from
                    </span>
                  )}
                  <span className="font-barlow font-black text-5xl text-red">
                    {bike.pricing.day}
                  </span>
                  <span className="text-white/50 text-sm">/ day</span>
                </div>
                <p className="text-white/60 text-xs tracking-wider uppercase">
                  Unlimited km · Insurance included · {BRAND.deposit} deposit
                </p>
              </div>

              {(bike.variantNote || bike.experienceNote) && (
                <div className="bg-sand px-4 py-3 mb-6 border-l-2 border-ink/30 text-xs space-y-1.5">
                  {bike.variantNote && (
                    <p className="text-ink leading-relaxed">
                      <span className="font-bold uppercase tracking-wider text-[10px] mr-2">Note</span>
                      {bike.variantNote}
                    </p>
                  )}
                  {bike.experienceNote && (
                    <p className="text-ink leading-relaxed">
                      <span className="font-bold uppercase tracking-wider text-[10px] mr-2">Heads up</span>
                      {bike.experienceNote}
                    </p>
                  )}
                </div>
              )}

              {bike.placeholder ? (
                <div className="bg-ink/5 border border-ink/15 px-5 py-4 text-sm text-ink/70">
                  This variant is being added soon. Photo and full pricing tiers coming. Contact us on WhatsApp for availability.
                </div>
              ) : (
                <button
                  onClick={scrollToCalendar}
                  className="inline-flex items-center justify-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-5 hover:bg-red-dark transition-colors"
                >
                  Check Availability
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Specs */}
          <section className="mb-16">
            <div className="text-center mb-8">
              <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
                The Bike
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-ink">
                Specs
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink/10">
              {specs.map((s) => (
                <div key={s.label} className="bg-off-white px-5 py-6">
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1.5">
                    {s.label}
                  </p>
                  <p className="font-barlow font-bold text-xl text-ink">{s.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Pricing tiers */}
          <section className="mb-16 bg-ink text-white p-8 md:p-12">
            <div className="text-center mb-8">
              <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/40 mb-2">
                Flexible terms
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-white">
                Rental Options
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10">
              {tiers.map((t) => (
                <div key={t.label} className="bg-ink px-5 py-7 text-center">
                  <svg
                    className="w-6 h-6 mx-auto mb-3 text-red"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                    />
                  </svg>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50 mb-1">
                    {t.label}
                  </p>
                  <p className="text-[10px] text-white/35 mb-3">{t.sub}</p>
                  <p className="font-barlow font-black text-3xl md:text-4xl text-red leading-none">
                    {t.price}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-white/70">
                <svg className="w-5 h-5 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                Unlimited km · all prices include insurance
              </div>
              <p className="text-white/50 text-xs">
                Deposit: <span className="text-white">{BRAND.deposit}</span> · Season: <span className="text-white">{bike.season}</span>
              </p>
            </div>
          </section>

          {/* Important info — applies to every rental */}
          <section className="mb-16 grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/10">
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">No phone holders</p>
                <p className="text-ink text-sm leading-snug">We don&apos;t offer or fit phone holders. None of our bikes come with one.</p>
              </div>
            </div>
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">Deposit</p>
                <p className="text-ink text-sm leading-snug">{BRAND.deposit} per bike, refunded after drop-off if no damage.</p>
              </div>
            </div>
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">Season</p>
                <p className="text-ink text-sm leading-snug">{bike.season}. Full tank in, full tank out.</p>
              </div>
            </div>
          </section>

          {/* Booking flow — calendar + form + success */}
          {!bike.placeholder && (
          <section ref={calendarRef} className="mb-16 scroll-mt-28">
            {bookingStep !== "done" && (
              <>
                <div className="text-center mb-8">
                  <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
                    Book your ride
                  </p>
                  <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-ink">
                    Pick Your Dates
                  </h2>
                  <p className="text-muted text-sm mt-3 max-w-md mx-auto">
                    Select your pick-up and drop-off dates. Greyed-out dates are already booked.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-5 text-xs text-muted mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red" />
                    Selected
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-ink/15" />
                    Booked
                  </div>
                </div>

                <div className="bg-white border border-ink/10 p-4 sm:p-6 overflow-x-auto flex justify-center">
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    numberOfMonths={isMobile ? 1 : 2}
                    disabled={[{ before: new Date() }, ...blocked]}
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
                      selected: "bg-red text-white hover:bg-red",
                      range_start: "bg-red text-white",
                      range_end: "bg-red text-white",
                      range_middle: "bg-red/15 text-ink",
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
                      <span className="font-semibold">{format(range.from, "dd MMM")}</span>
                      {range.to && (
                        <>
                          {" — "}
                          <span className="font-semibold">{format(range.to, "dd MMM yyyy")}</span>
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

                {bookingStep === "dates" && (
                  <div className="mt-5 flex justify-end">
                    <button
                      disabled={!range?.from || !range?.to || nights === 0}
                      onClick={handleContinueToForm}
                      className="bg-red text-white font-bold text-xs tracking-widest uppercase px-8 py-4 hover:bg-red-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Continue →
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Form */}
            {bookingStep === "form" && (
              <div ref={formRef} className="mt-12 scroll-mt-28">
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => setBookingStep("dates")}
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

                <div className="bg-ink text-white px-5 py-4 mb-7 flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Bike</p>
                    <p className="font-semibold mt-0.5">{bike.model}</p>
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
                    <p className="font-barlow font-black text-red text-2xl leading-none mt-0.5">
                      {totalPrice}€
                    </p>
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
                    <p className="text-muted text-xs mt-1.5">We&apos;ll confirm via WhatsApp.</p>
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                      Notes (optional)
                    </span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="E.g. need 2 helmets, special pickup time, anything else..."
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

            {/* Success */}
            {bookingStep === "done" && (
              <div ref={successRef} className="text-center scroll-mt-28">
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
                    category={bike.model}
                    range={range as { from: Date; to: Date }}
                    name={form.name}
                    phone={form.phone}
                    notes={form.notes}
                  />
                )}

                <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={resetBooking}
                    className="border border-ink/20 text-ink font-bold text-xs tracking-widest uppercase px-7 py-3 hover:border-red hover:text-red transition-colors"
                  >
                    New Booking
                  </button>
                  <Link
                    href="/#fleet"
                    className="bg-ink text-white font-bold text-xs tracking-widest uppercase px-7 py-3 hover:bg-red transition-colors"
                  >
                    Back to Fleet
                  </Link>
                </div>
              </div>
            )}
          </section>
          )}

          {/* Bottom WhatsApp CTA — only when not in done state */}
          {bookingStep !== "done" && (
            <section className="bg-red text-white px-8 md:px-12 py-12 md:py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div>
                <p className="text-white/60 text-xs tracking-widest uppercase mb-3">
                  Got questions?
                </p>
                <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] tracking-tight">
                  Ask on WhatsApp
                </h2>
                <p className="text-white/70 text-xs mt-2">
                  We speak <span className="text-base align-middle">{BRAND.languages.join(" ")}</span>
                </p>
              </div>
              <a
                href={`https://wa.me/${BRAND.phoneRaw}?text=${encodeURIComponent(
                  `Hi, I'm interested in the ${bike.model}. Is it available?`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center justify-center gap-2 bg-white text-red font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-off-white transition-colors"
              >
                {BRAND.phone} →
              </a>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
