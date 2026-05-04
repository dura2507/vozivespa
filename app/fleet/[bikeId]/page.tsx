"use client";

import { use, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CATEGORIES, BLOCKED_BY_ID, BRAND } from "@/lib/mockData";

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

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const specs: { label: string; value: string }[] = [
    { label: "Engine", value: bike.displacement },
    { label: "Power", value: bike.power },
    { label: "Top Speed", value: bike.maxSpeed },
    { label: "Seats", value: String(bike.seats) },
    { label: "Tank", value: bike.tank },
    { label: "Weight", value: bike.weight },
    { label: "Year", value: bike.year },
    { label: "Licence", value: bike.licence },
  ];

  const tiers: { label: string; sub: string; price: string }[] = [
    { label: "Daily", sub: "1 day", price: bike.pricing.day },
    { label: "Weekend", sub: "Fri – Sun", price: bike.pricing.weekend },
    { label: "Week", sub: "7 days", price: bike.pricing.week },
    { label: "Month", sub: "30 days", price: bike.pricing.month },
  ];

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

          {/* Hero — image + title + spec strip */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
            {/* Image gallery */}
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

            {/* Title + description + key facts */}
            <div className="flex flex-col">
              <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
                {bike.name}
              </p>
              <h1 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.9] tracking-tight text-ink mb-5">
                {bike.model}
              </h1>
              <p className="text-muted text-base leading-relaxed mb-7">
                {bike.longDescription}
              </p>

              <div className="bg-ink text-white p-6 mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-barlow font-black text-5xl text-red">
                    {bike.pricing.day}
                  </span>
                  <span className="text-white/50 text-sm">/ day</span>
                </div>
                <p className="text-white/60 text-xs tracking-wider uppercase">
                  Unlimited km · Insurance included
                </p>
              </div>

              <Link
                href={`/bookings?bike=${bike.id}`}
                className="inline-flex items-center justify-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-5 hover:bg-red-dark transition-colors"
              >
                Book this Bike
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
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

          {/* Pricing tiers — Mietoptionen */}
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
                Deposit: <span className="text-white">{bike.deposit}</span> · Season: <span className="text-white">{bike.season}</span>
              </p>
            </div>
          </section>

          {/* Availability calendar */}
          <section className="mb-16">
            <div className="text-center mb-8">
              <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
                When can I ride?
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-ink">
                Availability
              </h2>
              <p className="text-muted text-sm mt-3 max-w-md mx-auto">
                Greyed-out dates are already booked. Pick your dates in the booking flow.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-5 text-xs text-muted mb-5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-white border border-ink/20" />
                Available
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-ink/15" />
                Booked
              </div>
            </div>

            <div className="bg-white border border-ink/10 p-4 sm:p-6 overflow-x-auto flex justify-center">
              <DayPicker
                mode="single"
                disabled={[{ before: new Date() }, ...blocked]}
                numberOfMonths={isMobile ? 1 : 2}
                selected={undefined}
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
                  day_button: "w-9 h-9 text-sm font-medium text-ink",
                  today: "font-bold text-red",
                  outside: "text-ink/20",
                  disabled: "text-ink/20 cursor-not-allowed line-through",
                  hidden: "invisible",
                }}
              />
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="bg-red text-white px-8 md:px-12 py-12 md:py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <p className="text-white/60 text-xs tracking-widest uppercase mb-3">
                Ready to ride?
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] tracking-tight">
                Book the {bike.model}
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href={`/bookings?bike=${bike.id}`}
                className="inline-flex items-center justify-center gap-2 bg-white text-red font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-off-white transition-colors"
              >
                Check Dates →
              </Link>
              <a
                href={`https://wa.me/${BRAND.phoneRaw}?text=${encodeURIComponent(
                  `Hi, I'm interested in the ${bike.model}. Is it available?`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 border-2 border-white text-white font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-white hover:text-red transition-colors"
              >
                WhatsApp
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
