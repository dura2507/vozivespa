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
import { BRAND, type Category, type PaymentMethod } from "@/lib/mockData";
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
          <div className="bg-white border border-ink/10 p-6">
            <p className="text-2xl font-bold text-ink mb-2">Booking received</p>
            <p className="text-sm text-muted max-w-prose">
              Thanks {name}! We got your request for {cartCount} bikes and your
              deposit screenshot. We will confirm by email shortly. If you do not
              hear back within a few hours, message us on WhatsApp.
            </p>
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

        {/* Step 2: fleet picker */}
        {!rangeReady ? (
          <p className="text-sm text-muted">Pick a start and end date to see the fleet.</p>
        ) : (
          <>
            <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-3">
              Pick your bikes{loadingAvail ? " · checking availability…" : ""}
            </p>
            <div className="space-y-2 mb-8">
              {bikes.map((bike) => {
                const a = avail?.[bike.id];
                const free = a?.freeUnits ?? 0;
                const qty = qtyOf(bike.id);
                const price = priceFor(bike);
                const soldOut = a != null && free === 0;
                return (
                  <div
                    key={bike.id}
                    className={`bg-white border p-4 flex items-center gap-4 flex-wrap transition-colors ${
                      qty > 0 ? "border-red" : "border-ink/10"
                    }`}
                  >
                    <div className="relative w-20 h-14 shrink-0 bg-sand overflow-hidden">
                      {bike.image && (
                        <Image src={bike.image} alt={bike.model} fill className="object-cover" sizes="80px" />
                      )}
                    </div>
                    <div className="min-w-[160px] flex-1">
                      <div className="font-semibold text-ink">{bike.model}</div>
                      <div className="text-xs text-muted">
                        {price != null ? `${price}€ for this period` : `${bike.pricing.day}/day`}
                      </div>
                      {!a ? (
                        <div className="text-xs text-muted mt-0.5">checking…</div>
                      ) : soldOut ? (
                        <div className="text-xs text-red font-medium mt-0.5">
                          Booked out for these dates
                          {a.nextFree && (
                            <span className="text-ink/60 font-normal">
                              {" "}· available from {format(new Date(`${a.nextFree.from}T00:00:00`), "dd MMM", { locale: dfLocale })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-700 font-medium mt-0.5">
                          {free} available for these dates
                        </div>
                      )}
                    </div>
                    {soldOut ? (
                      <span className="text-xs text-muted uppercase tracking-[0.08em]">Unavailable</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setQty(bike.id, qty - 1)}
                          disabled={qty <= 0}
                          className="w-8 h-8 border border-ink/20 text-lg disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="font-bold text-sm min-w-5 text-center">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(bike.id, qty + 1)}
                          disabled={qty >= free}
                          className="w-8 h-8 border border-ink/20 text-lg disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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

                  <label className="block mt-4">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">Deposit screenshot *</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                      onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                      className="mt-1 w-full text-sm"
                    />
                  </label>
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
        )}
        </>
        )}
        </div>
      </main>
      <Footer lang={lang} t={dict.footer} nav={dict.nav} />
    </>
  );
}
