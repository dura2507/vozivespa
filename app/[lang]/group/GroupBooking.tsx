"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { enUS, de, es, it, hr } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import "react-day-picker/style.css";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND, LICENCE_BADGE, type Category, type PaymentMethod } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { buildSlots, calculatePrice } from "@/lib/pricing";
import { SEASON_END_DATE } from "@/lib/season";

const SLOTS = buildSlots();

const LICENCE_OPTIONS = [
  { value: "AM", label: "AM (moped / 50cc)" },
  { value: "A1", label: "A1 (up to 125cc)" },
  { value: "A2", label: "A2 (up to 35 kW)" },
  { value: "A", label: "A (unrestricted)" },
  { value: "B", label: "B (car licence, covers AM/50cc)" },
] as const;

const DATE_FNS_LOCALES: Partial<Record<Locale, DateFnsLocale>> = {
  en: enUS,
  de,
  es,
  it,
  hr,
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type FleetAvail = { totalUnits: number; freeUnits: number; nextFree: { from: string; to: string } | null };

// Riding style is per physical bike (per unit), not per group, so the
// shop can prep the right number of helmets. The cart holds one entry
// per booked unit; its value is that unit's riding style.
type RidingStyle = "solo" | "with_passenger";

export default function GroupBooking({
  bikes,
  lang,
  dict,
}: {
  bikes: Category[];
  lang: Locale;
  dict: Dictionary;
  unitCounts: Record<string, number>;
}) {
  const [range, setRange] = useState<DateRange | undefined>();
  const [pickupTime, setPickupTime] = useState("09:00");
  const [returnTime, setReturnTime] = useState("19:00");
  const [avail, setAvail] = useState<Record<string, FleetAvail> | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [isWide, setIsWide] = useState(false);
  // bikeId → one riding style per booked unit. Array length = quantity.
  const [cart, setCart] = useState<Record<string, RidingStyle[]>>({});
  const [step, setStep] = useState<"select" | "details" | "done">("select");

  // Details / deposit step state (mirrors the single-bike flow).
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [driversLicence, setDriversLicence] = useState<string>("");
  const [licenceCountry, setLicenceCountry] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod["id"]>("paypal_ff");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // A single calendar click leaves range.to undefined (DayPicker waits
  // for a second click). Treat "from set, to missing" as a same-day
  // rental so a single day can be booked.
  const effFrom = range?.from ?? null;
  const effTo = range?.to ?? range?.from ?? null;
  const from = effFrom ? toIsoDate(effFrom) : null;
  const to = effTo ? toIsoDate(effTo) : null;
  const rangeReady = Boolean(from && to);

  // Fetch whole-fleet availability for the chosen window. Re-runs on any
  // change to dates / times. The endpoint returns every model with its
  // free-unit count and (for sold-out ones) the nearest free window.
  useEffect(() => {
    if (!from || !to) {
      setAvail(null);
      return;
    }
    let cancelled = false;
    setLoadingAvail(true);
    const qs = new URLSearchParams({ from, to, pickupTime, returnTime });
    fetch(`/api/availability/fleet?${qs}`)
      .then((r) => r.json())
      .then((data: { bikes?: Array<{ bikeId: string } & FleetAvail> }) => {
        if (cancelled) return;
        const map: Record<string, FleetAvail> = {};
        for (const b of data.bikes ?? []) {
          map[b.bikeId] = { totalUnits: b.totalUnits, freeUnits: b.freeUnits, nextFree: b.nextFree };
        }
        setAvail(map);
      })
      .catch(() => !cancelled && setAvail({}))
      .finally(() => !cancelled && setLoadingAvail(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, pickupTime, returnTime]);

  // Two months side by side only on real desktop width (the instruction
  // panel sits beside them there); one month below that.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Per-bike total for the chosen window (one unit). Used for the card
  // price and the cart sum.
  const priceFor = useMemo(() => {
    const f = range?.from ?? null;
    const t = range?.to ?? range?.from ?? null;
    return (bike: Category): number | null => {
      if (!f || !t) return null;
      const res = calculatePrice(f, t, pickupTime, returnTime, bike.pricing);
      return res ? res.totalPrice : null;
    };
  }, [range, pickupTime, returnTime]);

  const qtyOf = (bikeId: string) => cart[bikeId]?.length ?? 0;
  const cartCount = Object.values(cart).reduce((a, arr) => a + arr.length, 0);
  // Helmets: every unit needs one for the rider, plus one more when a
  // passenger rides along. Surfaced to the owner so they can prep them.
  const helmetCount = Object.values(cart).reduce(
    (a, arr) => a + arr.reduce((s, rs) => s + (rs === "with_passenger" ? 2 : 1), 0),
    0,
  );
  const cartTotal = useMemo(() => {
    let sum = 0;
    for (const bike of bikes) {
      const qty = cart[bike.id]?.length ?? 0;
      if (qty <= 0) continue;
      const p = priceFor(bike);
      if (p != null) sum += p * qty;
    }
    return sum;
  }, [cart, bikes, priceFor]);

  function setQty(bikeId: string, qty: number) {
    const free = avail?.[bikeId]?.freeUnits ?? 0;
    const clamped = Math.max(0, Math.min(qty, free));
    setCart((c) => {
      const cur = c[bikeId] ?? [];
      const next = cur.slice(0, clamped);
      while (next.length < clamped) next.push("solo");
      return { ...c, [bikeId]: next };
    });
  }

  // Flip one booked unit's riding style (per-unit helmet planning).
  function setUnitRiding(bikeId: string, index: number, value: RidingStyle) {
    setCart((c) => {
      const cur = c[bikeId] ? [...c[bikeId]] : [];
      if (index < cur.length) cur[index] = value;
      return { ...c, [bikeId]: cur };
    });
  }

  // 20% booking fee secures the dates, rest paid on arrival (same as the
  // single-bike flow), here computed off the whole-group total.
  const bookingFee = Math.round(cartTotal * 0.2 * 100) / 100;

  function copyValue(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      },
      () => {},
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setSubmitError("Name, email and phone are required.");
      return;
    }
    if (!driversLicence) {
      setSubmitError("Pick your driver's licence category.");
      return;
    }
    if (!receipt) {
      setSubmitError("Upload your deposit screenshot.");
      return;
    }
    const items = bikes
      .filter((b) => qtyOf(b.id) > 0)
      .map((b) => ({ bikeId: b.id, ridingStyles: cart[b.id] }));
    if (items.length === 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("items", JSON.stringify(items));
      fd.set("name", name.trim());
      fd.set("email", email.trim());
      fd.set("phone", phone.trim());
      if (notes.trim()) fd.set("notes", notes.trim());
      if (licenceCountry.trim()) fd.set("licenceCountry", licenceCountry.trim());
      fd.set("from", from);
      fd.set("to", to);
      fd.set("pickupTime", pickupTime);
      fd.set("returnTime", returnTime);
      fd.set("paymentMethod", paymentMethod);
      fd.set("driversLicence", driversLicence);
      fd.set("locale", lang);
      fd.set("receipt", receipt);

      const res = await fetch("/api/bookings/group", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(typeof body?.error === "string" ? body.error : "Could not submit booking.");
        setSubmitting(false);
        return;
      }
      setStep("done");
    } catch (err) {
      console.error("group booking submit failed", err);
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dfLocale = DATE_FNS_LOCALES[lang] ?? enUS;

  return (
    <>
      <Navbar lang={lang} t={dict.nav} />
      <main className="pt-28 md:pt-32 pb-20 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-6xl mx-auto">
        <h1 className="font-barlow font-bold text-3xl md:text-4xl text-ink uppercase tracking-wide mb-2">
          Book multiple bikes
        </h1>
        <p className="text-sm text-muted mb-8 max-w-prose">
          Pick one date window, then add as many bikes as you need to a
          single booking with one deposit. We show the whole fleet so you
          can see what is free and when.
        </p>

        {step === "done" ? (
          <div className="text-center max-w-xl mx-auto py-6">
            <div className="success-pop inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500 mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path className="success-draw" strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="font-barlow font-black uppercase text-3xl md:text-4xl tracking-tight text-ink mb-3">
              Booking received
            </h2>
            <p className="text-ink text-base leading-relaxed mb-6">
              {name && `${name}, `}we got your group request and your deposit
              screenshot. We will confirm by email shortly. If you do not hear
              back within a few hours, message us on WhatsApp.
            </p>
            <div className="bg-sand px-5 py-4 mb-8 text-left text-sm">
              {bikes
                .filter((b) => qtyOf(b.id) > 0)
                .map((b) => (
                  <p key={b.id} className="text-ink">
                    {b.model} <span className="text-muted">× {qtyOf(b.id)}</span>
                  </p>
                ))}
              <p className="text-ink mt-2 pt-2 border-t border-ink/10">
                <span className="text-muted">Total: </span>
                {cartTotal}€ · {cartCount} bikes · {helmetCount} helmets
              </p>
            </div>
            <a
              href={`/${lang}/#fleet`}
              className="bg-ink text-white font-bold text-xs tracking-widest uppercase px-7 py-3 hover:bg-red transition-colors inline-block"
            >
              Back to fleet
            </a>
          </div>
        ) : (
        <>
        {/* Step 1: shared date window */}
        <div className="mb-8">
          <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-3">
            Your rental period
          </p>
          <div className="grid lg:grid-cols-[auto_1fr] gap-5 items-start">
          <div>
          <div className="bg-white border border-ink/10 p-4 sm:p-6 overflow-x-auto flex justify-center">
            <DayPicker
              mode="range"
              locale={dfLocale}
              selected={range}
              onSelect={setRange}
              weekStartsOn={1}
              numberOfMonths={isWide ? 2 : 1}
              startMonth={new Date()}
              endMonth={SEASON_END_DATE}
              disabled={[{ before: today }, { after: SEASON_END_DATE }]}
              min={1}
              classNames={{
                root: "font-sans",
                months: "flex flex-col sm:flex-row gap-6",
                month_caption: "flex items-center justify-center mb-4",
                caption_label: "font-barlow font-bold uppercase tracking-wide text-ink text-base",
                nav: "flex items-center gap-1",
                button_previous: "w-9 h-9 flex items-center justify-center text-ink/50 rounded-full hover:bg-red hover:text-white transition-colors cursor-pointer",
                button_next: "w-9 h-9 flex items-center justify-center text-ink/50 rounded-full hover:bg-red hover:text-white transition-colors cursor-pointer",
                month_grid: "w-full border-collapse",
                weekdays: "mb-2",
                weekday: "text-[10px] font-bold tracking-widest text-ink/30 text-center py-1 w-9 uppercase",
                day: "text-center p-0.5",
                day_button:
                  "w-9 h-9 text-sm font-medium text-ink transition-colors hover:bg-ink/5 cursor-pointer disabled:!bg-transparent disabled:text-ink/20 disabled:cursor-not-allowed disabled:hover:bg-transparent",
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

          {rangeReady && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                  Pickup time · {effFrom && format(effFrom, "EEE dd MMM", { locale: dfLocale })}
                </span>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                  Return time · {effTo && format(effTo, "EEE dd MMM", { locale: dfLocale })}
                </span>
                <select
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          </div>

          <aside className="bg-white border border-ink/10 p-5 lg:sticky lg:top-28">
            <p className="font-barlow font-bold uppercase tracking-wide text-ink text-sm mb-3">
              How it works
            </p>
            <ol className="space-y-2.5 text-sm text-ink/80">
              <li className="flex gap-2.5"><span className="font-bold text-red">1</span> Pick one date window for the whole group</li>
              <li className="flex gap-2.5"><span className="font-bold text-red">2</span> Add any bikes from the fleet that are free</li>
              <li className="flex gap-2.5"><span className="font-bold text-red">3</span> One deposit, one booking, sorted</li>
            </ol>
            <div className="border-t border-ink/10 mt-4 pt-4 space-y-1.5 text-xs text-muted">
              <p>20% now to reserve, the rest on arrival.</p>
              <p>{BRAND.deposit} security deposit on pickup.</p>
              <p>Same dates for all bikes.</p>
            </div>
          </aside>
          </div>
        </div>

        {/* Step 2: fleet picker — always visible so licence + specs show */}
        <>
            <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-3">
              {rangeReady
                ? `Pick your bikes${loadingAvail ? " · checking availability…" : ""}`
                : "The fleet · pick dates above to check availability"}
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {bikes.map((bike) => {
                const a = avail?.[bike.id];
                const free = a?.freeUnits ?? 0;
                const qty = qtyOf(bike.id);
                const price = priceFor(bike);
                const soldOut = a != null && free === 0;
                return (
                  <div
                    key={bike.id}
                    className={`bg-white border p-3 flex gap-3 transition-colors ${
                      qty > 0 ? "border-red" : "border-ink/10"
                    }`}
                  >
                    <a
                      href={`/${lang}/fleet/${bike.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative w-32 h-32 sm:w-40 sm:h-40 shrink-0 self-start bg-sand overflow-hidden block"
                    >
                      {bike.image && (
                        <Image src={bike.image} alt={bike.model} fill className="object-cover" sizes="160px" />
                      )}
                      {LICENCE_BADGE[bike.licenceCode] && (
                        <span className="absolute bottom-1.5 right-1.5 bg-white rounded-md p-1 shadow">
                          <Image
                            src={LICENCE_BADGE[bike.licenceCode]}
                            alt={`${bike.licenceCode} licence required`}
                            width={96}
                            height={96}
                            quality={100}
                            className="w-10 h-10 block"
                          />
                        </span>
                      )}
                    </a>
                    <div className="flex flex-col flex-1 min-w-0">
                      <a
                        href={`/${lang}/fleet/${bike.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-ink text-lg leading-tight hover:text-red"
                      >
                        {bike.model}
                      </a>
                      <div className="text-sm text-muted mt-1">
                        {price != null ? `${price}€ · period` : `from ${bike.pricing.day}/day`} · {bike.maxSpeed} ·{" "}
                        {bike.seats} {bike.seats > 1 ? "seats" : "seat"}
                      </div>
                      <div className="flex items-center gap-2.5 flex-wrap mt-2">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {dict.home.fleet.helmetsIncluded}
                        </span>
                        {bike.experienceNote && (
                          <span className="text-[11px] tracking-[0.08em] uppercase text-red font-bold">
                            {dict.home.fleet.experienceRequired}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                        <div className="text-sm min-w-0 leading-tight">
                          {!rangeReady ? (
                            <span className="text-ink/40 uppercase tracking-[0.08em]">Pick dates ↑</span>
                          ) : !a ? (
                            <span className="text-muted">checking…</span>
                          ) : soldOut ? (
                            <span className="text-red font-medium">
                              Booked
                              {a.nextFree && (
                                <span className="text-ink/60 font-normal">
                                  {" "}· from {format(new Date(`${a.nextFree.from}T00:00:00`), "dd MMM", { locale: dfLocale })}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium">{free} available</span>
                          )}
                        </div>
                        {rangeReady && !soldOut && a && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setQty(bike.id, qty - 1)}
                              disabled={qty <= 0}
                              className="w-8 h-8 border border-ink/20 text-lg leading-none disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="font-bold text-sm min-w-5 text-center">{qty}</span>
                            <button
                              type="button"
                              onClick={() => setQty(bike.id, qty + 1)}
                              disabled={qty >= free}
                              className="w-8 h-8 border border-ink/20 text-lg leading-none disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Global good-to-know — dark feature block like the detail page */}
            <section className="mb-8 bg-ink text-white p-6 md:p-8">
              <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/40 mb-6 text-center">
                Good to know · every rental
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10">
                {[
                  { label: "Helmets", value: "Included", sub: "Always provided", d: "M5 13l4 4L19 7", sw: 3 },
                  { label: "Insurance", value: "Basic, incl.", sub: "Theft + engine cover", d: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", sw: 1.5 },
                  { label: "Distance", value: "Unlimited km", sub: "No driving limit", d: "M5 13l4 4L19 7", sw: 3 },
                  { label: "Deposit", value: BRAND.deposit, sub: "Refunded if no damage", d: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z", sw: 1.5 },
                  { label: "Season", value: "Apr–Oct", sub: "Full tank in & out", d: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5", sw: 1.5 },
                  { label: "Fuel", value: "Full → full", sub: "Or we charge the diff", d: "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25", sw: 1.5 },
                  { label: "Phone holders", value: "Not available", sub: "Can't bring your own", d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", sw: 1.5 },
                  { label: "Pickup", value: "Our Zadar shop", sub: BRAND.address, d: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 9.75c0 7.142-7.5 11.25-7.5 11.25S4.5 16.892 4.5 9.75a7.5 7.5 0 1115 0z", sw: 1.5 },
                ].map((it, i) => (
                  <div key={i} className="bg-ink px-4 py-6 text-center">
                    <svg className="w-6 h-6 mx-auto mb-3 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={it.sw}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={it.d} />
                    </svg>
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50 mb-1.5">{it.label}</p>
                    <p className="text-white font-semibold text-sm leading-tight">{it.value}</p>
                    <p className="text-white/40 text-[10px] mt-1 leading-snug">{it.sub}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Cart bar */}
            <div className="bg-sand border border-ink/10 p-4 flex items-center justify-between gap-4 flex-wrap sticky bottom-4">
              <div>
                <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Your group</p>
                <p className="text-sm text-ink mt-0.5">
                  {cartCount === 0
                    ? "No bikes yet"
                    : bikes
                        .filter((b) => qtyOf(b.id) > 0)
                        .map((b) => `${b.model} × ${qtyOf(b.id)}`)
                        .join(" · ")}
                </p>
                {cartCount > 0 && (
                  <p className="text-xs text-muted mt-0.5">
                    {cartCount} bikes · {helmetCount} helmets · one deposit
                  </p>
                )}
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Total</p>
                  <p className="text-2xl font-bold text-red leading-tight">{cartTotal}€</p>
                </div>
                <button
                  type="button"
                  disabled={cartCount === 0}
                  onClick={() => setStep("details")}
                  className="bg-red text-white font-bold text-xs tracking-widest uppercase px-5 py-3 hover:bg-red-dark disabled:opacity-40"
                >
                  Continue →
                </button>
              </div>
            </div>

            {step === "details" && (
              <form onSubmit={handleSubmit} className="mt-6 bg-white border border-ink/10 p-5 space-y-5">
                <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  Your details
                </p>
                <div className="bg-sand px-4 py-3 text-xs text-ink/80 leading-relaxed">
                  <span className="font-semibold">Reminder:</span> helmets included · {BRAND.deposit} deposit on pickup · bring your valid licence · full tank in, full tank out · pickup at {BRAND.address}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Name *</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Phone *</span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Email *</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Driver licence *</span>
                    <select value={driversLicence} onChange={(e) => setDriversLicence(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white">
                      <option value="">—</option>
                      {LICENCE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Licence country</span>
                    <input value={licenceCountry} onChange={(e) => setLicenceCountry(e.target.value)} placeholder="e.g. Germany" className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                </div>

                {/* Riding style per bike → drives helmet prep */}
                <div className="border-t border-ink/10 pt-4">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Riding style per bike
                  </p>
                  <p className="text-xs text-muted mb-3">
                    So we prep the right helmets · {helmetCount} helmets total
                  </p>
                  <div className="space-y-2">
                    {bikes
                      .filter((b) => qtyOf(b.id) > 0)
                      .flatMap((b) =>
                        (cart[b.id] ?? []).map((rs, i) => (
                          <div key={`${b.id}-${i}`} className="flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-sm text-ink">
                              {b.model}
                              {qtyOf(b.id) > 1 ? ` #${i + 1}` : ""}
                            </span>
                            <div className="flex gap-2">
                              {(["solo", "with_passenger"] as RidingStyle[]).map((opt) => (
                                <button
                                  type="button"
                                  key={opt}
                                  onClick={() => setUnitRiding(b.id, i, opt)}
                                  className={`px-3 py-1.5 text-xs font-bold border transition-colors ${
                                    rs === opt
                                      ? "bg-ink text-white border-ink"
                                      : "bg-white text-ink/70 border-ink/15 hover:border-ink/40"
                                  }`}
                                >
                                  {opt === "solo" ? "Solo" : "With passenger"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )),
                      )}
                  </div>
                </div>

                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Notes</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                </label>

                <div className="border-t border-ink/10 pt-4">
                  <p className="text-sm text-ink mb-1">
                    Pay <span className="font-bold text-red">{bookingFee}€</span> now to secure your dates
                    {" "}(20% of {cartTotal}€). The rest ({Math.round((cartTotal - bookingFee) * 100) / 100}€) is paid on arrival.
                  </p>
                  <p className="text-xs text-muted mb-4">After paying, upload a screenshot below. Security deposit {BRAND.deposit} on pickup.</p>

                  <div className="space-y-2.5">
                    {(BRAND.payment as PaymentMethod[]).map((p) => {
                      const selected = paymentMethod === p.id;
                      return (
                        <label key={p.id} className={`block border ${selected ? "border-red bg-red/5" : "border-ink/15 bg-white hover:border-ink/30"} px-4 py-3 cursor-pointer transition-colors`}>
                          <div className="flex items-start gap-3">
                            <input type="radio" name="paymentMethod" value={p.id} checked={selected} onChange={() => setPaymentMethod(p.id)} className="mt-1 accent-red" />
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-ink text-sm">{p.label}</span>
                              {selected && (
                                <div className="mt-2 space-y-3">
                                  {p.link && (
                                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                                      <a href={p.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center justify-center bg-ink text-white text-[11px] font-bold tracking-widest uppercase px-4 py-2.5 hover:bg-red transition-colors">
                                        Pay {bookingFee}€ with {p.label.split(" · ")[0]}
                                      </a>
                                      <div className="bg-white border border-ink/10 p-2 inline-block shrink-0 self-start sm:self-center">
                                        <QRCodeSVG value={p.link} size={96} level="M" />
                                      </div>
                                    </div>
                                  )}
                                  {p.value && (
                                    <div>
                                      {p.valueLabel && <p className="text-[10px] tracking-[0.15em] uppercase text-muted mb-0.5">{p.valueLabel}</p>}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <code className="text-ink text-sm font-mono break-all">{p.value}</code>
                                        <button type="button" onClick={(e) => { e.preventDefault(); copyValue(p.valueCopy ?? p.value!, `${p.id}-value`); }} className="text-[10px] font-bold tracking-widest uppercase text-ink/60 hover:text-red px-2 py-1 border border-ink/15 hover:border-red">
                                          {copied === `${p.id}-value` ? "✓ Copied" : "Copy"}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {p.subValue && (
                                    <div>
                                      {p.subValueLabel && <p className="text-[10px] tracking-[0.15em] uppercase text-muted mb-0.5">{p.subValueLabel}</p>}
                                      <code className="text-ink text-sm font-mono break-all">{p.subValue}</code>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em] mb-1.5">
                      Deposit screenshot *
                    </p>
                    <input
                      id="group-receipt-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                      onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <label
                        htmlFor="group-receipt-file"
                        className="inline-flex items-center cursor-pointer bg-ink text-white font-bold text-[10px] tracking-widest uppercase px-4 py-2.5 hover:bg-red transition-colors"
                      >
                        Choose file
                      </label>
                      <span className="text-sm text-ink min-w-0 break-all">
                        {receipt ? (
                          <>
                            <span className="font-semibold">{receipt.name}</span>
                            <span className="text-muted ml-2">({(receipt.size / 1024).toFixed(0)} KB)</span>
                          </>
                        ) : (
                          <span className="text-muted">No file chosen</span>
                        )}
                      </span>
                      {receipt && (
                        <button
                          type="button"
                          onClick={() => {
                            setReceipt(null);
                            const el = document.getElementById("group-receipt-file") as HTMLInputElement | null;
                            if (el) el.value = "";
                          }}
                          className="text-[10px] font-bold tracking-widest uppercase text-ink/60 hover:text-red transition-colors px-2 py-1 border border-ink/15 hover:border-red"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-muted text-xs mt-2">JPG, PNG, HEIC or PDF · max 4 MB</p>
                  </div>
                </div>

                {submitError && <p className="text-red text-sm font-semibold">{submitError}</p>}

                <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
                  <button type="button" onClick={() => setStep("select")} className="text-xs font-bold tracking-widest uppercase text-ink/50 hover:text-red">
                    ← Back to bikes
                  </button>
                  <button type="submit" disabled={submitting} className="bg-red text-white font-bold text-xs tracking-widest uppercase px-6 py-3 hover:bg-red-dark disabled:opacity-50">
                    {submitting ? "Submitting…" : `Submit booking · ${cartCount} bikes`}
                  </button>
                </div>
              </form>
            )}
        </>
        </>
        )}
        </div>
      </main>
      <Footer lang={lang} t={dict.footer} nav={dict.nav} />
    </>
  );
}
