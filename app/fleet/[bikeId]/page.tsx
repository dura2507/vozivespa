"use client";

import { use, useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format, addDays, differenceInCalendarDays, isSameDay } from "date-fns";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CATEGORIES, BRAND, LICENCE_BADGE } from "@/lib/mockData";
import type { PaymentMethod } from "@/lib/mockData";
import {
  buildSlots,
  calculatePrice,
  TIER_LABEL,
  validPickupSlots,
  validReturnSlots,
  type ConfirmedBooking,
} from "@/lib/pricing";

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type PaymentMethodId = "paypal_ff" | "paypal_company" | "bank";

type BookingStep = "dates" | "form" | "submitting" | "done";

type BlockedRange = { from: Date; to: Date };

function toIsoDate(d: Date): string {
  // Local-time YYYY-MM-DD - DayPicker gives us Date objects in local TZ.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function BikeDetailPage({
  params,
}: {
  params: Promise<{ bikeId: string }>;
}) {
  const { bikeId } = use(params);
  const bikeOrUndef = CATEGORIES.find((c) => c.id === bikeId);
  if (!bikeOrUndef) notFound();
  const bike = bikeOrUndef;

  const [activeImage, setActiveImage] = useState(bike.image);
  const [range, setRange] = useState<DateRange | undefined>();
  const [pickupTime, setPickupTime] = useState("09:00");
  const [returnTime, setReturnTime] = useState("19:00");
  const [bookingStep, setBookingStep] = useState<BookingStep>("dates");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("paypal_ff");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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

  // Live availability from Supabase via /api/availability — split so
  // confirmed bookings expose pickup/return times (used to filter the
  // time-slot pickers) while owner manual blocks stay full-day.
  const [manualBlocks, setManualBlocks] = useState<BlockedRange[]>([]);
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability?bikeId=${encodeURIComponent(bike.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(
        (json: {
          manualBlocks: { from: string; to: string }[];
          bookings: ConfirmedBooking[];
        }) => {
          if (cancelled) return;
          setManualBlocks(
            json.manualBlocks.map((b) => ({
              from: new Date(`${b.from}T00:00:00`),
              to: new Date(`${b.to}T00:00:00`),
            })),
          );
          setBookings(json.bookings);
        },
      )
      .catch((err) => console.error("Failed to load availability", err));
    return () => {
      cancelled = true;
    };
  }, [bike.id]);

  // Pickup-day (range start) and return-day (range end) of a confirmed
  // booking get a diagonal half-fill in the calendar so the customer
  // sees they're transition days, not fully gone. Manual blocks stay
  // fully greyed for every day they cover.
  const bookedStartDays: Date[] = [];
  const bookedEndDays: Date[] = [];
  const bookedMiddleRanges: { from: Date; to: Date }[] = [];
  const bookedFullDays: Date[] = [];
  for (const b of bookings) {
    const from = new Date(`${b.from}T00:00:00`);
    const to = new Date(`${b.to}T00:00:00`);
    if (isSameDay(from, to)) {
      bookedFullDays.push(from);
      continue;
    }
    bookedStartDays.push(from);
    bookedEndDays.push(to);
    if (differenceInCalendarDays(to, from) >= 2) {
      bookedMiddleRanges.push({ from: addDays(from, 1), to: addDays(to, -1) });
    }
  }
  for (const m of manualBlocks) {
    bookedMiddleRanges.push({ from: m.from, to: m.to });
  }

  // Time-slot pickers respect adjacent confirmed bookings + 1h
  // turnaround buffer. If pickup-date is the return-day of an existing
  // booking, only slots ≥ that return + 60min show up (and vice versa).
  const pickupSlots = range?.from ? validPickupSlots(range.from, bookings) : buildSlots();
  const returnSlots = range?.to ? validReturnSlots(range.to, bookings) : buildSlots();

  // If the active selection got invalidated by a date change, snap to
  // the closest valid slot rather than sending an unbookable request.
  useEffect(() => {
    if (pickupSlots.length > 0 && !pickupSlots.includes(pickupTime)) {
      setPickupTime(pickupSlots[0]);
    }
  }, [pickupSlots, pickupTime]);
  useEffect(() => {
    if (returnSlots.length > 0 && !returnSlots.includes(returnTime)) {
      setReturnTime(returnSlots[returnSlots.length - 1]);
    }
  }, [returnSlots, returnTime]);

  const priceResult =
    range?.from && range?.to
      ? calculatePrice(range.from, range.to, pickupTime, returnTime, bike.pricing)
      : null;
  const totalPrice = priceResult?.totalPrice ?? 0;
  const appliedTier = priceResult?.appliedTier ?? null;
  const billableDays = priceResult?.billableDays ?? 0;

  function scrollToCalendar() {
    calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleContinueToForm() {
    setBookingStep("form");
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!range?.from || !range?.to) return;
    if (!receipt) {
      setReceiptError("Upload a screenshot of your deposit transaction.");
      return;
    }

    setSubmitError(null);
    setBookingStep("submitting");

    try {
      const fd = new FormData();
      fd.set("bikeId", bike.id);
      fd.set("name", form.name);
      fd.set("email", form.email);
      fd.set("phone", form.phone);
      if (form.notes) fd.set("notes", form.notes);
      fd.set("from", toIsoDate(range.from));
      fd.set("to", toIsoDate(range.to));
      fd.set("pickupTime", pickupTime);
      fd.set("returnTime", returnTime);
      fd.set("paymentMethod", paymentMethod);
      fd.set("totalPriceCents", String(totalPrice * 100));
      fd.set("receipt", receipt);

      const res = await fetch("/api/bookings", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body?.error === "string"
            ? body.error
            : "Something went wrong - please try again.";
        setSubmitError(message);
        setBookingStep("form");
        return;
      }

      setBookingStep("done");
      setTimeout(() => {
        successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err) {
      console.error("booking submit failed", err);
      setSubmitError("Network error - please try again.");
      setBookingStep("form");
    }
  }

  function resetBooking() {
    setBookingStep("dates");
    setRange(undefined);
    setPickupTime("09:00");
    setReturnTime("19:00");
    setForm({ name: "", email: "", phone: "", notes: "" });
    setPaymentMethod("paypal_ff");
    setReceipt(null);
    setReceiptError(null);
    setSubmitError(null);
  }

  async function copyValue(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch (err) {
      console.error("clipboard write failed", err);
    }
  }

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setReceiptError(null);
    if (!file) {
      setReceipt(null);
      return;
    }
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ];
    if (!allowed.includes(file.type)) {
      setReceiptError("File must be JPG, PNG, HEIC or PDF.");
      e.target.value = "";
      setReceipt(null);
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setReceiptError("File is too large — max 4 MB.");
      e.target.value = "";
      setReceipt(null);
      return;
    }
    setReceipt(file);
  }

  const bookingFee = Math.round(totalPrice * 0.2 * 100) / 100;
  const canSubmit = bookingStep === "form" && !!receipt && !receiptError;

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

          {/* Hero - image + title */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
            <div>
              <div className="relative">
                <div className="relative aspect-[4/3] bg-sand overflow-hidden">
                  <Image
                    src={activeImage}
                    alt={bike.model}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                  />
                </div>
                <div
                  className="absolute -bottom-5 -left-5 z-10 pointer-events-none"
                  title={`Licence required: ${bike.licence}`}
                >
                  <Image
                    src={LICENCE_BADGE[bike.licenceCode]}
                    alt={`${bike.licenceCode} licence required`}
                    width={320}
                    height={320}
                    quality={100}
                    className="w-32 h-32 sm:w-36 sm:h-36 drop-shadow-2xl"
                  />
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
                  Unlimited km · Basic insurance · {BRAND.deposit} deposit
                </p>

                <div className="mt-5 pt-5 border-t border-white/10">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-red font-bold mb-1">
                    Required licence
                  </p>
                  <p className="text-white text-sm font-semibold leading-snug">
                    {bike.licence}
                  </p>
                  <p className="text-white/50 text-xs leading-snug mt-1">
                    Bring your valid licence to pickup - no licence, no ride.
                  </p>
                </div>
              </div>

              {bike.experienceNote && (
                <div className="bg-sand px-4 py-3 mb-6 border-l-2 border-red text-xs">
                  <p className="text-ink leading-relaxed">
                    <span className="font-bold uppercase tracking-wider text-[10px] mr-2">Heads up</span>
                    {bike.experienceNote}
                  </p>
                </div>
              )}

              <button
                onClick={scrollToCalendar}
                className="inline-flex items-center justify-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-5 hover:bg-red-dark transition-colors"
              >
                Check Availability
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
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
                Unlimited km · all prices include BASIC insurance
              </div>
              <p className="text-white/50 text-xs">
                Deposit: <span className="text-white">{BRAND.deposit}</span> · Season: <span className="text-white">{bike.season}</span>
              </p>
            </div>
          </section>

          {/* Important info - applies to every rental */}
          <section className="mb-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/10">
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">No phone holders</p>
                <p className="text-ink text-sm leading-snug">We don&apos;t offer or fit phone holders.</p>
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">Season</p>
                <p className="text-ink text-sm leading-snug">{bike.season}. We rent only in this window.</p>
              </div>
            </div>
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">Full tank policy</p>
                <p className="text-ink text-sm leading-snug">Bike is delivered with a full tank. Return it full.</p>
              </div>
            </div>
          </section>

          {/* Booking flow - calendar + form + success */}
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
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[linear-gradient(135deg,_transparent_50%,_rgba(26,26,26,0.15)_50%)]" />
                    Half day · still bookable
                  </div>
                </div>

                <div className="bg-white border border-ink/10 p-4 sm:p-6 overflow-x-auto flex justify-center">
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    weekStartsOn={1}
                    numberOfMonths={isMobile ? 1 : 2}
                    disabled={[
                      { before: new Date() },
                      ...bookedFullDays,
                      ...bookedMiddleRanges,
                    ]}
                    excludeDisabled
                    min={1}
                    modifiers={{
                      bookedFull: [...bookedFullDays, ...bookedMiddleRanges],
                      bookedStart: bookedStartDays,
                      bookedEnd: bookedEndDays,
                    }}
                    modifiersClassNames={{
                      bookedFull:
                        "[&_button]:!bg-ink/10 [&_button]:!text-ink/40 [&_button]:!line-through",
                      bookedStart:
                        "[&_button]:!bg-[linear-gradient(135deg,_transparent_50%,_rgba(26,26,26,0.15)_50%)]",
                      bookedEnd:
                        "[&_button]:!bg-[linear-gradient(135deg,_rgba(26,26,26,0.15)_50%,_transparent_50%)]",
                    }}
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
                        "w-9 h-9 text-sm font-medium text-ink transition-colors hover:bg-red/10 cursor-pointer disabled:text-ink/20 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                      selected: "bg-red text-white hover:bg-red",
                      range_start: "bg-red text-white",
                      range_end: "bg-red text-white",
                      range_middle: "bg-red/15 text-ink",
                      today: "font-bold text-red",
                      outside: "text-ink/20",
                      hidden: "invisible",
                    }}
                  />
                </div>

                {range?.from && range?.to && (
                  <>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                          Pickup time · {format(range.from, "EEE dd MMM")}
                        </span>
                        <select
                          value={pickupTime}
                          onChange={(e) => setPickupTime(e.target.value)}
                          disabled={pickupSlots.length === 0}
                          className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all disabled:bg-ink/5 disabled:text-ink/40"
                        >
                          {pickupSlots.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                          {pickupSlots.length === 0 && (
                            <option value="">No slots available</option>
                          )}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                          Return time · {format(range.to, "EEE dd MMM")}
                        </span>
                        <select
                          value={returnTime}
                          onChange={(e) => setReturnTime(e.target.value)}
                          disabled={returnSlots.length === 0}
                          className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all disabled:bg-ink/5 disabled:text-ink/40"
                        >
                          {returnSlots.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                          {returnSlots.length === 0 && (
                            <option value="">No slots available</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <p className="text-muted text-xs mt-2">
                      Shop hours 09:00–19:00. Times outside this window
                      {pickupSlots.length < buildSlots().length || returnSlots.length < buildSlots().length
                        ? " (or too close to another booking — we need 1h between bookings)"
                        : ""}
                      {" "}aren&apos;t possible.
                    </p>

                    <div className="mt-4 bg-sand px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="text-sm text-ink">
                        <span className="font-semibold">
                          {format(range.from, "dd MMM")} {pickupTime}
                        </span>
                        {" → "}
                        <span className="font-semibold">
                          {format(range.to, "dd MMM yyyy")} {returnTime}
                        </span>
                        {billableDays > 0 && (
                          <span className="text-muted ml-2">
                            ({billableDays} {billableDays === 1 ? "day" : "days"})
                          </span>
                        )}
                      </div>
                      {totalPrice > 0 && (
                        <div className="text-right">
                          <div className="font-barlow font-black text-red text-2xl leading-none">
                            {totalPrice}€
                          </div>
                          {appliedTier && appliedTier !== "day" && (
                            <p className="text-[10px] tracking-[0.15em] uppercase text-muted font-bold mt-1">
                              {TIER_LABEL[appliedTier]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {bookingStep === "dates" && (
                  <div className="mt-5 flex justify-end">
                    <button
                      disabled={!range?.from || !range?.to || totalPrice === 0}
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
            {(bookingStep === "form" || bookingStep === "submitting") && (
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
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Pickup</p>
                    <p className="font-semibold mt-0.5">
                      {range?.from ? `${format(range.from, "dd MMM yyyy")} · ${pickupTime}` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Return</p>
                    <p className="font-semibold mt-0.5">
                      {range?.to ? `${format(range.to, "dd MMM yyyy")} · ${returnTime}` : "-"}
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
                      Phone (with country code) *
                    </span>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={(e) => {
                        let v = e.target.value;
                        // Auto-prefix '+' if user starts typing without it
                        if (v && !v.startsWith("+")) v = "+" + v.replace(/^\++/, "");
                        setForm({ ...form, phone: v });
                      }}
                      onFocus={(e) => {
                        if (!form.phone) setForm({ ...form, phone: "+" });
                        // Place cursor at end so the user types after '+'
                        const el = e.target;
                        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
                      }}
                      pattern="^\+[0-9 ]{6,}$"
                      placeholder="+49 170 1234567"
                      className={inputClass}
                    />
                    <p className="text-muted text-xs mt-1.5">
                      Include your country code (e.g. <span className="font-semibold">+49</span> for Germany, <span className="font-semibold">+385</span> for Croatia, <span className="font-semibold">+41</span> for Switzerland).
                    </p>
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

                  {/* Deposit / payment section */}
                  <div className="border-t border-ink/10 pt-7 mt-2">
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="font-barlow font-bold uppercase text-lg tracking-tight text-ink">
                        Deposit
                      </h3>
                      <p className="text-muted text-xs">
                        20% of {totalPrice}€ to lock the booking
                      </p>
                    </div>
                    <p className="text-ink text-sm leading-relaxed mb-1">
                      Pay <span className="font-bold text-red">{bookingFee}€</span> via one of the methods below, then upload a screenshot of the transaction. The remaining {Math.round((totalPrice - bookingFee) * 100) / 100}€ is paid in cash on pickup.
                    </p>
                    <p className="text-muted text-xs mb-5">
                      We don&apos;t accept credit cards. No deposit, no reservation.
                    </p>

                    <div className="space-y-2.5 mb-5">
                      {(BRAND.payment as PaymentMethod[]).map((p) => {
                        const selected = paymentMethod === p.id;
                        return (
                          <label
                            key={p.id}
                            className={`block border ${
                              selected
                                ? "border-red bg-red/5"
                                : "border-ink/15 bg-white hover:border-ink/30"
                            } px-4 py-3 cursor-pointer transition-colors`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="paymentMethod"
                                value={p.id}
                                checked={selected}
                                onChange={() => setPaymentMethod(p.id)}
                                className="mt-1 accent-red"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className="font-semibold text-ink text-sm">
                                    {p.label}
                                  </span>
                                  {p.recommended && (
                                    <span className="text-[9px] font-bold tracking-widest uppercase text-red bg-red/10 px-1.5 py-0.5">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                {selected && (
                                  <div className="mt-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <code className="text-ink text-sm font-mono break-all">
                                        {p.value}
                                      </code>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          copyValue(p.value, p.id);
                                        }}
                                        className="text-[10px] font-bold tracking-widest uppercase text-ink/60 hover:text-red transition-colors px-2 py-1 border border-ink/15 hover:border-red"
                                      >
                                        {copied === p.id ? "✓ Copied" : "Copy"}
                                      </button>
                                    </div>
                                    {p.subValue && (
                                      <p className="text-muted text-xs mt-1.5">
                                        Account holder: <span className="text-ink font-semibold">{p.subValue}</span>
                                      </p>
                                    )}
                                  </div>
                                )}
                                {p.note && (
                                  <p className="text-muted text-xs mt-1.5">{p.note}</p>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        Receipt screenshot *
                      </span>
                      <div className="mt-1.5 flex items-center gap-3">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                          onChange={handleReceiptChange}
                          required
                          className="block w-full text-sm text-ink file:mr-3 file:py-2.5 file:px-4 file:border-0 file:text-[10px] file:font-bold file:tracking-widest file:uppercase file:bg-ink file:text-white file:cursor-pointer hover:file:bg-red transition-colors"
                        />
                      </div>
                      {receipt && (
                        <p className="text-ink text-xs mt-2">
                          <span className="font-semibold">{receipt.name}</span>
                          <span className="text-muted ml-2">
                            ({(receipt.size / 1024).toFixed(0)} KB)
                          </span>
                        </p>
                      )}
                      {receiptError && (
                        <p className="text-red text-xs mt-2 font-semibold">{receiptError}</p>
                      )}
                      <p className="text-muted text-xs mt-2">
                        JPG, PNG, HEIC or PDF · max 4 MB
                      </p>
                    </label>
                  </div>

                  {submitError && (
                    <p className="text-red text-sm text-center font-semibold">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={bookingStep === "submitting" || !canSubmit}
                    className="w-full py-4 bg-red text-white font-bold text-xs tracking-widest uppercase hover:bg-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {bookingStep === "submitting" ? "Sending…" : "Send Request →"}
                  </button>

                  <p className="text-center text-muted text-xs">
                    We&apos;ll review your deposit screenshot and confirm by email — usually within a few hours.
                  </p>
                </form>
              </div>
            )}

            {/* Success */}
            {bookingStep === "done" && (
              <div ref={successRef} className="text-center scroll-mt-28 max-w-xl mx-auto">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-red/10 mb-6">
                  <svg className="w-10 h-10 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,8vw,5rem)] leading-none tracking-tight text-ink mb-4">
                  Request Sent!
                </h2>
                <p className="text-ink text-base leading-relaxed mb-2">
                  Thanks {form.name} - we&apos;ll review and get back to you shortly.
                </p>
                <p className="text-muted text-sm leading-relaxed mb-8">
                  A confirmation email is on its way to <span className="font-semibold text-ink">{form.email}</span>. The final booking confirmation comes by email once the owner reviews - usually within a few hours.
                </p>

                <div className="bg-sand px-5 py-4 mb-10 text-left text-sm">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-muted mb-2 font-bold">What you booked</p>
                  <p className="text-ink"><span className="text-muted">Bike: </span>{bike.model}</p>
                  {range?.from && range?.to && (
                    <>
                      <p className="text-ink">
                        <span className="text-muted">Pickup: </span>
                        {format(range.from, "dd MMM yyyy")} · {pickupTime}
                      </p>
                      <p className="text-ink">
                        <span className="text-muted">Return: </span>
                        {format(range.to, "dd MMM yyyy")} · {returnTime}
                      </p>
                    </>
                  )}
                  {totalPrice > 0 && (
                    <p className="text-ink"><span className="text-muted">Total: </span>{totalPrice}€</p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
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

          {/* Bottom WhatsApp CTA - only when not in done state */}
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
