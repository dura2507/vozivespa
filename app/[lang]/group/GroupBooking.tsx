"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { enUS, de, es, it, hr, hu, sk, cs, ptBR } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import "react-day-picker/style.css";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND, LICENCE_BADGE, type Category, type PaymentMethod } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import {
  buildSlots,
  buildPickupSlots,
  calculatePrice,
  LAST_PICKUP_MINUTES,
  EARLY_PICKUP_SLOTS,
  LATE_RETURN_SLOTS,
  isEarlyPickup,
  isLateReturn,
  outsideHoursSurcharge,
} from "@/lib/pricing";
import { SEASON_END_DATE, zagrebNow } from "@/lib/season";
import SumUpCardWidget from "@/components/SumUpCardWidget";

// Return may be at closing (19:00); pickup never is (buildPickupSlots).
const SLOTS = buildSlots();
const PICKUP_SLOTS = buildPickupSlots();

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
  hu,
  sk,
  cs,
  pt: ptBR,
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type FleetAvail = { totalUnits: number; freeUnits: number; freeFromTime: string | null; freeIfReturnBy: string | null; nextFree: { from: string; to: string; pickupTime: string } | null };

// Riding style is per physical bike (per unit), not per group, so the
// shop can prep the right number of helmets. The cart holds one entry
// per booked unit; its value is that unit's riding style.
type RidingStyle = "solo" | "with_passenger";

type PayMode = "screenshot" | "deposit" | "full";

export default function GroupBooking({
  bikes,
  lang,
  dict,
  onlinePayment,
}: {
  bikes: Category[];
  lang: Locale;
  dict: Dictionary;
  unitCounts: Record<string, number>;
  onlinePayment: boolean;
}) {
  const [range, setRange] = useState<DateRange | undefined>();
  const [pickupTime, setPickupTime] = useState("09:00");
  const [returnTime, setReturnTime] = useState("19:00");
  const [avail, setAvail] = useState<Record<string, FleetAvail> | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [isWide, setIsWide] = useState(false);
  // bikeId → one riding style per booked unit. Array length = quantity.
  const [cart, setCart] = useState<Record<string, RidingStyle[]>>({});
  const [step, setStep] = useState<"select" | "details" | "paying" | "done">("select");
  // Advance to the data-entry step and scroll the form into view so it's obvious the
  // customer now needs to fill in their details (the form renders further down the
  // page). Mirrors the single-bike flow's handleContinueToForm: the small timeout
  // lets the form mount first, and the global scroll-padding-top clears the navbar.
  const detailsRef = useRef<HTMLFormElement>(null);
  function goToDetails() {
    setStep("details");
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
  const [payMode, setPayMode] = useState<PayMode>(onlinePayment ? "deposit" : "screenshot");
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [checkoutAmountCents, setCheckoutAmountCents] = useState<number>(0);

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
  // Image lightbox: src of the photo currently shown enlarged, or null.
  const [preview, setPreview] = useState<string | null>(null);
  // Time-dependent filtering (dropping today's already-passed pickup
  // slots) only after mount, so SSR and first client render agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A single calendar click leaves range.to undefined (DayPicker waits
  // for a second click). Treat "from set, to missing" as a same-day
  // rental so a single day can be booked.
  const effFrom = range?.from ?? null;
  const effTo = range?.to ?? range?.from ?? null;
  const from = effFrom ? toIsoDate(effFrom) : null;
  const to = effTo ? toIsoDate(effTo) : null;
  const rangeReady = Boolean(from && to);

  // Pickup slots offered for the selected start day. On today, slots that
  // have already passed are dropped (after mount, hydration-safe). Same
  // rule the single-bike page uses, so no past pickup can be selected.
  const pickupOptions = useMemo(() => {
    // Early-pickup slots (before 09:00) are offered as +30€ add-on options.
    const withEarly = [...EARLY_PICKUP_SLOTS, ...PICKUP_SLOTS];
    // "Today" and "which slots are past" must be judged in Zadar wall-clock
    // (Europe/Zagreb), not the visitor's browser clock — else a far-timezone
    // rider sees the wrong slots. Mirrors the single-bike page + the server.
    if (!mounted || !effFrom) return withEarly;
    const zn = zagrebNow();
    if (toIsoDate(effFrom) !== zn.isoDate) return withEarly;
    return withEarly.filter((s) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m > zn.minutesOfDay;
    });
  }, [mounted, effFrom]);
  // Late-return slots (after 19:00) are offered as +30€ add-on options.
  const returnOptions = useMemo(() => [...SLOTS, ...LATE_RETURN_SLOTS], []);

  // Keep the selected pickup time valid as options shrink through the day.
  // Default to the first IN-HOURS slot, never an early (+30€) one.
  useEffect(() => {
    if (pickupOptions.length > 0 && !pickupOptions.includes(pickupTime)) {
      setPickupTime(pickupOptions.find((s) => !isEarlyPickup(s)) ?? pickupOptions[0]);
    }
  }, [pickupOptions, pickupTime]);

  // Once past the last pickup slot (18:30), today can't be a start day —
  // disable it in the calendar so it isn't selectable with no valid time.
  const disableTodayNoSlots =
    mounted && zagrebNow().minutesOfDay > LAST_PICKUP_MINUTES;

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
      .then((r) => {
        if (!r.ok) throw new Error(`fleet availability ${r.status}`);
        return r.json();
      })
      .then((data: { bikes?: Array<{ bikeId: string } & FleetAvail> }) => {
        if (cancelled) return;
        const map: Record<string, FleetAvail> = {};
        for (const b of data.bikes ?? []) {
          map[b.bikeId] = { totalUnits: b.totalUnits, freeUnits: b.freeUnits, freeFromTime: b.freeFromTime, freeIfReturnBy: b.freeIfReturnBy, nextFree: b.nextFree };
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
  // Security deposit is per vehicle (250€ each), not one flat deposit for
  // the whole group. The total shown to the customer is count × each.
  const depositEach = parseInt(BRAND.deposit, 10) || 250;
  const depositTotal = cartCount * depositEach;
  // Helmets: every unit needs one for the rider, plus one more when a
  // passenger rides along. Surfaced to the owner so they can prep them.
  const helmetCount = Object.values(cart).reduce(
    (a, arr) => a + arr.reduce((s, rs) => s + (rs === "with_passenger" ? 2 : 1), 0),
    0,
  );
  // Outside-hours add-on (Thomas): a pickup before 09:00 or a return after
  // 19:00 (chosen in the time dropdowns) adds a flat 30€ each, once per group
  // booking. Folded into the group total so the 20% fee, the live total and
  // the submit all match; the server re-applies it from the same times.
  const outsideSurcharge = outsideHoursSurcharge(pickupTime, returnTime);
  const cartTotal = useMemo(() => {
    let sum = 0;
    for (const bike of bikes) {
      const qty = cart[bike.id]?.length ?? 0;
      if (qty <= 0) continue;
      const p = priceFor(bike);
      if (p != null) sum += p * qty;
    }
    if (sum > 0) sum += outsideSurcharge;
    return sum;
  }, [cart, bikes, priceFor, outsideSurcharge]);

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
      setSubmitError(dict.group.errRequired);
      return;
    }
    if (!driversLicence) {
      setSubmitError(dict.group.errLicence);
      return;
    }
    const online = payMode !== "screenshot";
    if (!online && !receipt) {
      setSubmitError(dict.group.errReceipt);
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
      const addonNote = [
        isEarlyPickup(pickupTime) ? `Early pickup ${pickupTime} (+30€)` : null,
        isLateReturn(returnTime) ? `Late return ${returnTime} (+30€)` : null,
      ].filter(Boolean).join(", ");
      const notesOut = [notes.trim(), addonNote].filter(Boolean).join(" | ");
      if (notesOut) fd.set("notes", notesOut);
      if (licenceCountry.trim()) fd.set("licenceCountry", licenceCountry.trim());
      fd.set("from", from);
      fd.set("to", to);
      fd.set("pickupTime", pickupTime);
      fd.set("returnTime", returnTime);
      if (!online) fd.set("paymentMethod", paymentMethod);
      fd.set("driversLicence", driversLicence);
      fd.set("locale", lang);
      if (online) {
        fd.set("payOnline", "1");
      } else if (receipt) {
        fd.set("receipt", receipt);
      }

      const res = await fetch("/api/bookings/group", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(typeof body?.error === "string" ? body.error : dict.group.errSubmit);
        setSubmitting(false);
        return;
      }
      if (!online) {
        setStep("done");
        return;
      }
      // Online path: reserved booking is in, create the checkout. The group
      // route returns bookingIds[] (one row per unit) — the checkout keys off
      // any row in the group and sums the whole group's total, so use the
      // first id. (The single-bike route returns a scalar bookingId.)
      const okBody = (await res.json()) as { bookingId?: string; bookingIds?: string[] };
      const bookingId = okBody.bookingId ?? okBody.bookingIds?.[0];
      if (!bookingId) throw new Error("Missing bookingId");
      setPendingBookingId(bookingId);
      const coRes = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, amountMode: payMode }),
      });
      const coBody = (await coRes.json()) as {
        widgetCheckoutId?: string;
        amountCents?: number;
        error?: string;
      };
      if (!coRes.ok || !coBody.widgetCheckoutId) {
        setSubmitError(coBody.error ?? dict.group.errSubmit);
        setSubmitting(false);
        return;
      }
      setCheckoutId(coBody.widgetCheckoutId);
      setCheckoutAmountCents(coBody.amountCents ?? 0);
      setStep("paying");
    } catch (err) {
      console.error("group booking submit failed", err);
      setSubmitError(dict.group.errNetwork);
    } finally {
      setSubmitting(false);
    }
  }

  const g = dict.group;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dfLocale = DATE_FNS_LOCALES[lang] ?? enUS;

  return (
    <>
      <Navbar lang={lang} t={dict.nav} />

      {preview && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label={g.closePreview}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white hover:text-red"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative w-[92vw] max-w-3xl h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <Image src={preview} alt="" fill className="object-contain" sizes="92vw" />
          </div>
        </div>
      )}
      <main className="pt-28 md:pt-32 pb-20 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-6xl mx-auto">
        <h1 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] leading-none tracking-tight text-ink mb-3">
          {g.title}
        </h1>
        <p className="text-base text-muted mb-8 max-w-prose leading-relaxed">
          {g.intro}
        </p>

        {step === "paying" && pendingBookingId && checkoutId ? (
          <div className="max-w-xl mx-auto py-6 space-y-4">
            <h2 className="font-barlow font-black uppercase text-2xl text-ink">
              {payMode === "full" ? "Complete payment" : "Deposit payment"}
            </h2>
            <p className="text-sm text-muted">
              {payMode === "full"
                ? "Pay the full rental now to confirm the booking."
                : `Pay the 20% deposit (${bookingFee}€) to confirm the booking. The rest is due on arrival.`}
            </p>
            <SumUpCardWidget
              bookingId={pendingBookingId}
              checkoutId={checkoutId}
              amountCents={checkoutAmountCents}
              currency="EUR"
              locale={lang}
              onPaid={() => setStep("done")}
              onFail={(msg) => setSubmitError(msg)}
            />
            {submitError && <p className="text-xs text-red font-medium">{submitError}</p>}
          </div>
        ) : step === "done" ? (
          <div className="text-center max-w-xl mx-auto py-6">
            <div className="success-pop inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500 mb-6">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path className="success-draw" strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="font-barlow font-black uppercase text-3xl md:text-4xl tracking-tight text-ink mb-3">
              {g.received}
            </h2>
            <p className="text-ink text-base leading-relaxed mb-6">
              {name && `${name}, `}{g.receivedBody}
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
                <span className="text-muted">{dict.fleet.success.summaryTotal}: </span>
                {cartTotal}€ · {cartCount} {g.bikesWord} · {helmetCount} {g.helmetsWord}
              </p>
            </div>
            <a
              href={`/${lang}/#fleet`}
              className="bg-ink text-white font-bold text-xs tracking-widest uppercase px-7 py-3 hover:bg-red transition-colors inline-block"
            >
              {g.backToFleet}
            </a>
          </div>
        ) : (
        <>
        {/* Step 1: shared date window */}
        <div className="mb-8">
          <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-3">
            {g.period}
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
              disabled={[
                { before: today },
                { after: SEASON_END_DATE },
                ...(disableTodayNoSlots ? [today] : []),
              ]}
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
                  {dict.fleet.calendar.pickupTime} · {effFrom && format(effFrom, "EEE dd MMM", { locale: dfLocale })}
                </span>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all"
                >
                  {pickupOptions.map((s) => (
                    <option key={s} value={s}>{isEarlyPickup(s) ? `${s}  (+30€)` : s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                  {dict.fleet.calendar.returnTime} · {effTo && format(effTo, "EEE dd MMM", { locale: dfLocale })}
                </span>
                <select
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all"
                >
                  {returnOptions.map((s) => (
                    <option key={s} value={s}>{isLateReturn(s) ? `${s}  (+30€)` : s}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          </div>

          <aside className="bg-white border border-ink/10 p-5 lg:sticky lg:top-28">
            <p className="font-barlow font-bold uppercase tracking-wide text-ink text-sm mb-3">
              {g.howItWorks}
            </p>
            <ol className="space-y-2.5 text-sm text-ink/80">
              <li className="flex gap-2.5"><span className="font-bold text-red">1</span> {g.step1}</li>
              <li className="flex gap-2.5"><span className="font-bold text-red">2</span> {g.step2}</li>
              <li className="flex gap-2.5"><span className="font-bold text-red">3</span> {g.step3}</li>
            </ol>
            <div className="border-t border-ink/10 mt-4 pt-4 space-y-1.5 text-xs text-muted">
              <p>{g.reserveLine}</p>
              <p>{g.depositLine.replace("{deposit}", BRAND.deposit)}</p>
              <p>{g.sameDates}</p>
              {/* Same passengers rule as the bike detail page (owner request 2026-07-20) */}
              <p>{dict.fleet.specsSection.passengersText}</p>
            </div>
          </aside>
          </div>
        </div>

        {/* Step 2: fleet picker — always visible so licence + specs show */}
        <>
            <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-3">
              {rangeReady
                ? `${g.pickBikes}${loadingAvail ? ` · ${g.checkingAvailability}` : ""}`
                : g.fleetNoDates}
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
                    className={`relative bg-white border p-3 transition-colors ${
                      qty > 0 ? "border-red" : "border-ink/10"
                    }`}
                  >
                    {soldOut && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65 text-center px-4">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-[0.08em] text-ink/80 leading-snug">
                            {g.notAvailable}
                          </p>
                          {a?.freeFromTime ? (
                            <div className="mt-1.5">
                              <p className="text-xs text-emerald-700 font-medium">
                                {g.freeFromTime} {a.freeFromTime}
                              </p>
                              <button
                                type="button"
                                onClick={() => setPickupTime(a.freeFromTime!)}
                                className="mt-1.5 inline-block bg-ink text-white text-[11px] font-bold uppercase tracking-[0.08em] px-3 py-1.5 hover:bg-red transition-colors"
                              >
                                {g.useTime} ({a.freeFromTime})
                              </button>
                            </div>
                          ) : a?.freeIfReturnBy ? (
                            <div className="mt-1.5">
                              <p className="text-xs text-emerald-700 font-medium">
                                {g.freeIfReturnBy} {a.freeIfReturnBy}
                              </p>
                              <button
                                type="button"
                                onClick={() => setReturnTime(a.freeIfReturnBy!)}
                                className="mt-1.5 inline-block bg-ink text-white text-[11px] font-bold uppercase tracking-[0.08em] px-3 py-1.5 hover:bg-red transition-colors"
                              >
                                {g.useReturn} ({a.freeIfReturnBy})
                              </button>
                            </div>
                          ) : (
                            a?.nextFree && (
                              <div className="mt-1.5">
                                <p className="text-xs text-emerald-700 font-medium">
                                  {g.freeFrom} {format(new Date(`${a.nextFree.from}T00:00:00`), "dd MMM", { locale: dfLocale })} {g.at} {a.nextFree.pickupTime}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRange({
                                      from: new Date(`${a.nextFree!.from}T00:00:00`),
                                      to: new Date(`${a.nextFree!.to}T00:00:00`),
                                    });
                                    setPickupTime(a.nextFree!.pickupTime);
                                  }}
                                  className="mt-1.5 inline-block bg-ink text-white text-[11px] font-bold uppercase tracking-[0.08em] px-3 py-1.5 hover:bg-red transition-colors"
                                >
                                  {g.useDates} ({format(new Date(`${a.nextFree.from}T00:00:00`), "dd MMM", { locale: dfLocale })}, {a.nextFree.pickupTime})
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    <div className={`flex gap-3 ${soldOut ? "opacity-40 grayscale pointer-events-none" : ""}`}>
                      <button
                        type="button"
                        onClick={() => bike.image && setPreview(bike.image)}
                        aria-label={g.enlarge}
                        className="relative w-24 h-24 sm:w-32 sm:h-32 shrink-0 self-start bg-sand overflow-hidden block cursor-zoom-in"
                      >
                        {bike.image && (
                          <Image src={bike.image} alt={bike.model} fill className="object-cover" sizes="128px" />
                        )}
                      </button>

                      <div className="relative flex flex-col flex-1 min-w-0 pr-[4.5rem] sm:pr-28">
                        {LICENCE_BADGE[bike.licenceCode] && (
                          <Image
                            src={LICENCE_BADGE[bike.licenceCode]}
                            alt={`${bike.licenceCode} licence required`}
                            width={120}
                            height={120}
                            quality={100}
                            className="absolute top-1/2 right-0 -translate-y-1/2 w-16 h-16 sm:w-24 sm:h-24"
                          />
                        )}
                        <a
                          href={`/${lang}/fleet/${bike.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-ink text-base sm:text-lg leading-tight hover:text-red"
                        >
                          {bike.model}
                        </a>
                        <div className="text-sm text-muted mt-1">
                          {price != null ? `${price}€ · ${g.period2}` : `${bike.pricing.day}${dict.fleet.priceBox.perDay}`} · {bike.maxSpeed} ·{" "}
                          {bike.seats} {bike.seats > 1 ? g.seats : g.seat}
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap mt-1.5">
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

                        {!soldOut && (
                          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                            <div className="text-sm min-w-0 leading-tight">
                              {!rangeReady ? (
                                <span className="text-ink/40 uppercase tracking-[0.08em]">{g.pickDates} ↑</span>
                              ) : !a ? (
                                <span className="text-muted">{g.checking}</span>
                              ) : (
                                <span className="text-emerald-700 font-medium">{free} {g.available}</span>
                              )}
                            </div>
                            {rangeReady && a && (
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
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Two full-bleed feature bands, stacked, that flow edge to edge */}
            <div className="my-8 w-screen relative left-1/2 -translate-x-1/2">
            <div className="bg-ink text-white px-5 md:px-12 py-6 grid grid-cols-2 gap-x-5 gap-y-5 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8 md:gap-x-12 sm:gap-y-4">
              {[
                { label: g.bandDeposit, value: BRAND.deposit, d: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z", sw: 1.5 },
                { label: g.bandInsurance, value: g.valIncluded, d: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", sw: 1.5 },
                { label: g.bandKm, value: g.valUnlimited, d: "M5 13l4 4L19 7", sw: 3 },
                { label: g.bandFuel, value: "Full → full", d: "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25", sw: 1.5 },
                { label: g.bandDay, value: "24h = 1 day", d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", sw: 1.5 },
              ].map((it, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <svg className="w-6 h-6 text-red shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={it.sw}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={it.d} />
                  </svg>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold">{it.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">{it.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-sand text-ink px-5 md:px-12 py-6 grid grid-cols-2 gap-x-5 gap-y-5 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8 md:gap-x-12 sm:gap-y-4">
              {[
                { label: g.bandHelmets, value: g.valIncluded, d: "M5 13l4 4L19 7", sw: 3 },
                { label: g.bandSeason, value: "Apr–Oct", d: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5", sw: 1.5 },
                { label: g.bandPhone, value: g.valNotAvailable, d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", sw: 1.5 },
                { label: g.bandPickup, value: g.valZadarShop, d: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 9.75c0 7.142-7.5 11.25-7.5 11.25S4.5 16.892 4.5 9.75a7.5 7.5 0 1115 0z", sw: 1.5 },
              ].map((it, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <svg className="w-6 h-6 text-red shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={it.sw}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={it.d} />
                  </svg>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold">{it.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-ink/45">{it.label}</p>
                  </div>
                </div>
              ))}
            </div>
            </div>

            {/* Cart bar */}
            <div className="bg-sand border border-ink/10 p-4 flex items-center justify-between gap-4 flex-wrap sticky bottom-4">
              <div>
                {rangeReady && effFrom && effTo && (
                  <p className="text-sm text-ink font-medium mb-1.5">
                    {from === to
                      ? format(effFrom, "dd MMM", { locale: dfLocale })
                      : `${format(effFrom, "dd MMM", { locale: dfLocale })} → ${format(effTo, "dd MMM", { locale: dfLocale })}`}
                    <span className="text-muted font-normal"> · {pickupTime}–{returnTime}</span>
                  </p>
                )}
                <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.yourGroup}</p>
                <p className="text-sm text-ink mt-0.5">
                  {cartCount === 0
                    ? g.noBikes
                    : bikes
                        .filter((b) => qtyOf(b.id) > 0)
                        .map((b) => `${b.model} × ${qtyOf(b.id)}`)
                        .join(" · ")}
                </p>
                {cartCount > 0 && (
                  <>
                    <p className="text-xs text-muted mt-0.5">
                      {cartCount} {g.bikesWord} · {helmetCount} {g.helmetsWord}
                    </p>
                    <p className="text-xs text-ink font-semibold mt-0.5">
                      {g.depositSummary
                        .replace("{count}", String(cartCount))
                        .replace("{each}", BRAND.deposit)
                        .replace("{total}", `${depositTotal}€`)}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{dict.fleet.calendar.total}</p>
                  <p className="text-2xl font-bold text-red leading-tight">{cartTotal}€</p>
                </div>
                <button
                  type="button"
                  disabled={cartCount === 0}
                  onClick={goToDetails}
                  className="bg-red text-white font-bold text-xs tracking-widest uppercase px-5 py-3 hover:bg-red-dark disabled:opacity-40"
                >
                  {g.continue} →
                </button>
              </div>
            </div>

            {step === "details" && (
              <form ref={detailsRef} onSubmit={handleSubmit} className="mt-6 bg-white border border-ink/10 p-5 space-y-5">
                <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  {dict.fleet.form.title}
                </p>
                <div className="bg-sand px-4 py-3 text-xs text-ink/80 leading-relaxed">
                  {g.reminder.replace("{deposit}", BRAND.deposit).replace("{address}", BRAND.address)}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.lblName} *</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.lblPhone} *</span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.lblEmail} *</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.lblLicence} *</span>
                    <select value={driversLicence} onChange={(e) => setDriversLicence(e.target.value)} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white">
                      <option value="">—</option>
                      {LICENCE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.lblLicenceCountry}</span>
                    <input value={licenceCountry} onChange={(e) => setLicenceCountry(e.target.value)} placeholder={g.licenceCountryPh} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                  </label>
                </div>

                {/* Riding style per bike → drives helmet prep */}
                <div className="border-t border-ink/10 pt-4">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    {g.ridingPerBike}
                  </p>
                  <p className="text-xs text-muted mb-3">
                    {g.helmetsHint} · {helmetCount} {g.helmetsTotal}
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
                                  {opt === "solo" ? dict.fleet.form.ridingStyleSolo : dict.fleet.form.ridingStyleWithPassenger}
                                </button>
                              ))}
                            </div>
                          </div>
                        )),
                      )}
                  </div>
                </div>

                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">{g.lblNotes}</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm" />
                </label>

                <div className="border-t border-ink/10 pt-4">
                  <p className="text-sm text-ink mb-1">
                    {g.payHeadline
                      .replace("{fee}", String(bookingFee))
                      .replace("{total}", String(cartTotal))
                      .replace("{rest}", String(Math.round((cartTotal - bookingFee) * 100) / 100))}
                  </p>
                  <p className="text-xs text-muted mb-4">{g.payUpload.replace("{deposit}", BRAND.deposit)}</p>

                  {/* Pay-mode selector — same three options as the single-bike page. */}
                  {onlinePayment && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
                      {([
                        { id: "deposit" as const, label: dict.payment.depositLabel, hint: dict.payment.depositHint.replace("{amount}", String(bookingFee)) },
                        { id: "full" as const, label: dict.payment.fullLabel, hint: dict.payment.fullHint.replace("{amount}", String(cartTotal)) },
                        { id: "screenshot" as const, label: dict.payment.manualLabel, hint: dict.payment.manualHint },
                      ] satisfies Array<{ id: PayMode; label: string; hint: string }>).map((opt) => {
                        const selected = payMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setPayMode(opt.id)}
                            className={`text-left px-4 py-3 border transition-colors ${
                              selected ? "border-red bg-red/5" : "border-ink/15 bg-white hover:border-ink/30"
                            }`}
                          >
                            <p className="font-semibold text-ink text-sm">{opt.label}</p>
                            <p className="text-xs text-muted mt-0.5">{opt.hint}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {payMode === "screenshot" && (
                  <>
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
                                        {g.payWith.replace("{fee}", String(bookingFee)).replace("{method}", p.label.split(" · ")[0])}
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
                                          {copied === `${p.id}-value` ? `✓ ${dict.fleet.reservation.copied}` : dict.fleet.reservation.copy}
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
                      {g.depositScreenshot} *
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
                        {g.chooseFile}
                      </label>
                      <span className="text-sm text-ink min-w-0 break-all">
                        {receipt ? (
                          <>
                            <span className="font-semibold">{receipt.name}</span>
                            <span className="text-muted ml-2">({(receipt.size / 1024).toFixed(0)} KB)</span>
                          </>
                        ) : (
                          <span className="text-muted">{g.noFile}</span>
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
                          {g.remove}
                        </button>
                      )}
                    </div>
                    <p className="text-muted text-xs mt-2">{g.fileHint}</p>
                  </div>
                  </>
                  )}
                </div>

                {submitError && <p className="text-red text-sm font-semibold">{submitError}</p>}

                <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
                  <button type="button" onClick={() => setStep("select")} className="text-xs font-bold tracking-widest uppercase text-ink/50 hover:text-red">
                    ← {g.backToBikes}
                  </button>
                  <button type="submit" disabled={submitting} className="bg-red text-white font-bold text-xs tracking-widest uppercase px-6 py-3 hover:bg-red-dark disabled:opacity-50">
                    {submitting ? dict.fleet.form.submitting : `${g.submit} · ${cartCount} ${g.bikesWord}`}
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
