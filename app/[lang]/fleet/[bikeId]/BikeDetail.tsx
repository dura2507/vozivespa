"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format, isSameDay } from "date-fns";
import { enUS, de, es, it, hr, hu, sk, cs, ptBR } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import "react-day-picker/style.css";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND, LICENCE_BADGE, type Category } from "@/lib/mockData";
import type { PaymentMethod } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import {
  buildSlots,
  buildPickupSlots,
  calculatePrice,
  TIER_LABEL,
  validPickupSlots,
  validReturnSlots,
  isWindowFree,
  EARLY_PICKUP_SLOTS,
  LATE_RETURN_SLOTS,
  isEarlyPickup,
  isLateReturn,
  outsideHoursSurcharge,
  type ConfirmedBooking,
} from "@/lib/pricing";
import { SEASON_END_DATE, zagrebNow } from "@/lib/season";
import SumUpCardWidget from "@/components/SumUpCardWidget";

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type PaymentMethodId = "paypal_ff" | "paypal_company" | "bank" | "revolut";

const LICENCE_OPTIONS = [
  { value: "AM", label: "AM (moped / 50cc)" },
  { value: "A1", label: "A1 (up to 125cc)" },
  { value: "A2", label: "A2 (up to 35 kW)" },
  { value: "A", label: "A (unrestricted)" },
  { value: "B", label: "B (car licence, covers AM/50cc)" },
] as const;
type Licence = (typeof LICENCE_OPTIONS)[number]["value"];

type RidingStyleId = "solo" | "with_passenger";

type BookingStep = "dates" | "form" | "submitting" | "paying" | "done";
type PayMode = "screenshot" | "deposit" | "full";

function toIsoDate(d: Date): string {
  // Local-time YYYY-MM-DD - DayPicker gives us Date objects in local TZ.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function BikeDetail({
  bike,
  lang,
  dict,
  unitCount,
  onlinePayment,
}: {
  bike: Category;
  lang: Locale;
  dict: Dictionary;
  unitCount: number;
  onlinePayment: boolean;
}) {
  const tF = dict.fleet;
  const tBike = dict.bikes[bike.id as keyof typeof dict.bikes];
  const dateLocale: DateFnsLocale = ({ en: enUS, de, es, it, hr, hu, sk, cs, pt: ptBR } as Record<string, DateFnsLocale>)[lang] ?? enUS;
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
  const [driversLicence, setDriversLicence] = useState<Licence | "">("");
  const [licenceCountry, setLicenceCountry] = useState("");
  const [ridingStyle, setRidingStyle] = useState<RidingStyleId | "">("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // Pay-by-card flow state. Defaults to the deposit when online is on;
  // falls back to the screenshot flow when it's not. Once the server
  // hands us a pending booking + checkout, we render the SumUp widget.
  const [payMode, setPayMode] = useState<PayMode>(onlinePayment ? "deposit" : "screenshot");
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [checkoutAmountCents, setCheckoutAmountCents] = useState<number>(0);
  // Time-dependent calendar/slot filtering (dropping already-passed slots
  // on today) must only kick in after mount, otherwise the server render
  // and the first client render disagree and React warns about hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [copied, setCopied] = useState<string | null>(null);
  const isSinglePassenger = bike.seats === 1;
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

  // Single-seat bikes can only be ridden solo. Pre-fill so the
  // customer doesn't have to think about it.
  useEffect(() => {
    if (isSinglePassenger && ridingStyle !== "solo") {
      setRidingStyle("solo");
    }
  }, [isSinglePassenger, ridingStyle]);

  // Live availability from Supabase via /api/availability. Bookings
  // feed the time-slot pickers; `blockedPickupDates` is the server-
  // computed calendar truth (same engine as the submit check and the
  // multi-booking fleet view) — the calendar paints it verbatim and
  // never re-derives day status client-side.
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  const [totalUnits, setTotalUnits] = useState(1);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  // Active bookable unit ids — passed to the slot filters so they can
  // count actual free units per candidate window (per-unit rather than
  // per-model), matching what findFreeUnit does server-side.
  const [activeUnitIds, setActiveUnitIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability?bikeId=${encodeURIComponent(bike.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(
        (json: {
          bookings: ConfirmedBooking[];
          totalUnits: number;
          unitIds: string[];
          blockedPickupDates?: string[];
        }) => {
          if (cancelled) return;
          // Backup / reserve units are off-the-books online (the ghost-bike
          // flow parks a booking on a hidden reserve unit). Their bookings
          // must never shrink PUBLIC slot availability. The server's
          // blockedPickupDates already excludes them; the client-side pickup
          // / return pickers must do the same, else a booking on the reserve
          // unit gets counted against regular capacity and empties the
          // dropdown even while a real unit is free (e.g. a same-day pick
          // while the ghost bike is out). Drop any booking whose unit isn't
          // in the public unitIds list; keep legacy null-unit bookings (they
          // conservatively block the whole model).
          const publicUnitIds = new Set(json.unitIds ?? []);
          setBookings(
            (json.bookings ?? []).filter(
              (b) => !b.unitId || publicUnitIds.has(b.unitId),
            ),
          );
          setTotalUnits(json.totalUnits || 1);
          setActiveUnitIds(json.unitIds ?? []);
          setBlockedDates(json.blockedPickupDates ?? []);
        },
      )
      .catch((err) => console.error("Failed to load availability", err));
    return () => {
      cancelled = true;
    };
  }, [bike.id]);

  // Calendar day shading, unit-count agnostic. Every day is one of:
  //   RED       no unit has any bookable pickup slot (server blockedDates)
  //   GREEN     a pickup is possible across the whole opening day
  //   HALF-RED  bookable, but not the whole day. Morning blocked (free only
  //             from later), afternoon blocked (free only until earlier), or
  //             only a window in the middle. The shape is derived from the
  //             SAME pickup-slot check the time dropdown uses, so the calendar
  //             and the picker can never disagree. This replaces the old
  //             single-unit-only half-cell: a multi-unit day where the last
  //             free unit only opens up midday (e.g. 3 of 4 out, the 4th back
  //             at 12:00) is now correctly half-red instead of full green.
  const { bookedFullDays, amRedDays, pmRedDays, middleOnlyDays } = useMemo(() => {
    const full: Date[] = [];
    const amRed: Date[] = []; // morning blocked -> free from later (left red)
    const pmRed: Date[] = []; // afternoon blocked -> free until earlier (right red)
    const middleOnly: Date[] = []; // only a mid-day window free (both ends red)
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const futureOrToday = (d: Date) => d.getTime() >= todayMidnight.getTime();

    // Fully-out days come verbatim from the server (same engine as the submit
    // check). Never re-derived here — that's how the calendar and the
    // multi-booking used to drift apart. Past dates are already disabled by
    // { before: new Date() }, so skip them.
    const blockedSet = new Set(blockedDates);
    for (const iso of blockedDates) {
      const d = new Date(`${iso}T00:00:00`);
      if (futureOrToday(d)) full.push(d);
    }

    // A day can only be PART free where a booking starts or ends — that's what
    // leaves a boundary. A day with no boundary is either fully free (green) or
    // fully out (already blocked above). Judge each candidate with the
    // dropdown's own same-day pickup check so calendar and picker stay locked
    // together. This is booking-driven, not clock-driven: "today" is shaped by
    // its bookings, not by the current time (past slots are the dropdown's job).
    const allPickup = buildPickupSlots();
    const firstSlot = allPickup[0];
    const lastSlot = allPickup[allPickup.length - 1];
    const seen = new Set<string>();
    for (const b of bookings) {
      for (const iso of [b.from, b.to]) {
        if (seen.has(iso) || blockedSet.has(iso)) continue;
        seen.add(iso);
        const d = new Date(`${iso}T00:00:00`);
        if (!futureOrToday(d)) continue;
        // Bookable pickup slots for the day: a slot counts if some valid
        // return exists after it (a unit is free for a window starting there).
        const slots = allPickup.filter(
          (s) =>
            validReturnSlots(d, bookings, totalUnits, {
              pickupDate: d,
              pickupTime: s,
              activeUnitIds,
            }).length > 0,
        );
        if (slots.length === 0) continue; // fully out -> server already reds it
        const morningBlocked = slots[0] !== firstSlot;
        const afternoonBlocked = slots[slots.length - 1] !== lastSlot;
        if (morningBlocked && afternoonBlocked) middleOnly.push(d);
        else if (morningBlocked) amRed.push(d);
        else if (afternoonBlocked) pmRed.push(d);
        // else: pickup possible across the whole day -> plain green.
      }
    }
    return {
      bookedFullDays: full,
      amRedDays: amRed,
      pmRedDays: pmRed,
      middleOnlyDays: middleOnly,
    };
  }, [bookings, totalUnits, activeUnitIds, blockedDates]);

  // Single click on the calendar leaves range.to undefined — DayPicker
  // is waiting for a second click to complete the range. We treat
  // "from set, to missing" as a same-day rental so the user can pick
  // a single date, see the day-tier price, and continue. A second
  // click on a later date still extends into a real range normally.
  const effectiveRange =
    range?.from && !range.to ? { from: range.from, to: range.from } : range;

  // Slots offered on a given day for the PICKUP dropdown. When a return
  // date is already picked we scope the check to the whole window so the
  // dropdown never advertises a start time that would then clash further
  // down the rental. When no return is picked yet, we fall back to the
  // per-slot check — otherwise pinning a single pickup day would make the
  // filter think every other day is a "start after end" window and hide
  // every later day as unbookable.
  const pickupSlotsFor = (day: Date): string[] => {
    // Always pass activeUnitIds so the pickup filter counts free units
    // per-unit (the authoritative engine, same as the calendar / the
    // server submit check). For a real range we scope to the whole window;
    // for a single-day (same-day) pick we scope to that day up to close.
    // Passing activeUnitIds even on the same-day path keeps the dropdown
    // in lockstep with the calendar instead of falling back to the coarser
    // totalUnits-minus-busy count.
    const to = effectiveRange?.to;
    const isRange =
      effectiveRange?.from && to && !isSameDay(effectiveRange.from, to);
    const base =
      isRange && to
        ? // Multi-day: scope pickups to the whole chosen window so we never
          // advertise a start time that clashes later in the rental.
          validPickupSlots(day, bookings, totalUnits, {
            returnDate: to,
            returnTime: returnTime || "19:00",
            activeUnitIds,
          })
        : // Same-day: a pickup is bookable if ANY valid return exists after it
          // (a unit is free for some window starting there) — NOT only if the
          // unit stays free until 19:00. Otherwise a short morning gap before a
          // later booking would offer no pickup at all, even though the bike is
          // genuinely free then (the "free in the pill but unbookable" bug).
          // Uses the same engine as the return dropdown, so they stay in lockstep.
          buildPickupSlots().filter(
            (s) =>
              validReturnSlots(day, bookings, totalUnits, {
                pickupDate: day,
                pickupTime: s,
                activeUnitIds,
              }).length > 0,
          );
    // "Is this day today, and which slots are already past" must be judged in
    // Zadar wall-clock (Europe/Zagreb), NOT the visitor's browser clock — else
    // a rider in a far-ahead timezone (UTC+8/+10) sees Zadar's afternoon slots
    // as "past" and gets an empty dropdown. Mirror the server (zagrebNow).
    if (!mounted) return base;
    const zn = zagrebNow();
    if (format(day, "yyyy-MM-dd") !== zn.isoDate) return base;
    return base.filter((s) => {
      const [h, min] = s.split(":").map(Number);
      return h * 60 + min > zn.minutesOfDay;
    });
  };

  // Time-slot pickers count busy units at each candidate time and
  // reject slots only when every unit is busy (or in turnaround) at
  // that moment.
  const pickupBase = effectiveRange?.from
    ? pickupSlotsFor(effectiveRange.from)
    : buildPickupSlots();
  const returnBase =
    effectiveRange?.from && effectiveRange?.to && pickupTime
      ? validReturnSlots(effectiveRange.to, bookings, totalUnits, {
          pickupDate: effectiveRange.from,
          pickupTime,
          activeUnitIds,
        })
      : buildSlots();

  // Outside-hours slots (before 09:00 / after 19:00) are offered as +30€
  // add-on options only when a unit is genuinely free for the REAL extended
  // window (an early pickup starts the window earlier, a late return ends it
  // later — regions the in-hours base never validated), so the dropdown never
  // advertises a slot the server's findFreeUnit would reject. Early slots on
  // "today" are also past-filtered against Zadar wall-clock, same as the base.
  const earlyExtras = (() => {
    const from = effectiveRange?.from;
    if (!pickupBase.length || !from) return [] as string[];
    const returnDate = effectiveRange?.to ?? from;
    let slots = EARLY_PICKUP_SLOTS;
    if (mounted) {
      const zn = zagrebNow();
      if (format(from, "yyyy-MM-dd") === zn.isoDate) {
        slots = slots.filter((s) => {
          const [h, m] = s.split(":").map(Number);
          return h * 60 + m > zn.minutesOfDay;
        });
      }
    }
    return slots.filter((s) =>
      isWindowFree(from, s, returnDate, returnTime || "19:00", bookings, totalUnits, activeUnitIds),
    );
  })();
  const lateExtras =
    returnBase.length && effectiveRange?.from && effectiveRange?.to && pickupTime
      ? LATE_RETURN_SLOTS.filter((s) =>
          isWindowFree(effectiveRange.from!, pickupTime, effectiveRange.to!, s, bookings, totalUnits, activeUnitIds),
        )
      : [];
  const pickupSlots = [...earlyExtras, ...pickupBase];
  const returnSlots = [...returnBase, ...lateExtras];

  // If the active selection got invalidated by a date change, snap to
  // the closest valid slot rather than sending an unbookable request.
  // When a day has NO valid slots (e.g. today too late for the 8h
  // window), clear the time so the summary doesn't show a stale 09:00
  // and the Continue button can't fire on an unbookable selection.
  useEffect(() => {
    if (pickupSlots.length === 0) {
      if (pickupTime !== "") setPickupTime("");
    } else if (!pickupSlots.includes(pickupTime)) {
      // Default to the first IN-HOURS slot, never an early (+30€) slot —
      // the surcharge is always an explicit choice by the customer.
      setPickupTime(pickupSlots.find((s) => !isEarlyPickup(s)) ?? pickupSlots[0]);
    }
  }, [pickupSlots, pickupTime]);
  useEffect(() => {
    if (returnSlots.length === 0) {
      if (returnTime !== "") setReturnTime("");
    } else if (!returnSlots.includes(returnTime)) {
      // Default to the last IN-HOURS slot, never a late (+30€) slot.
      const normals = returnSlots.filter((s) => !isLateReturn(s));
      const list = normals.length ? normals : returnSlots;
      setReturnTime(list[list.length - 1]);
    }
  }, [returnSlots, returnTime]);

  const priceResult =
    effectiveRange?.from && effectiveRange?.to && pickupTime && returnTime
      ? calculatePrice(effectiveRange.from, effectiveRange.to, pickupTime, returnTime, bike.pricing)
      : null;
  const basePrice = priceResult?.totalPrice ?? 0;
  // Outside-hours add-on (Thomas): a pickup before 09:00 or a return after
  // 19:00 is chosen straight in the time dropdowns and adds a flat 30€ each,
  // per rental. billableDays already clamps to shop hours, so the base rate
  // never gains a day; the surcharge is layered on top and flows through the
  // 20% fee, the summary and the online charge.
  const surcharge = basePrice > 0 ? outsideHoursSurcharge(pickupTime, returnTime) : 0;
  const totalPrice = basePrice + surcharge;
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
    if (!effectiveRange?.from || !effectiveRange?.to) return;
    const online = payMode !== "screenshot";
    if (!online && !receipt) {
      setReceiptError(tF.reservation.uploadError);
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
      // Flag the outside-hours add-on in the notes so it reaches the owner's
      // Telegram/email (the surcharge is already in totalPriceCents, and the
      // exact time is also the stored pickup_time / return_time).
      const addonNote = [
        isEarlyPickup(pickupTime) ? `Early pickup ${pickupTime} (+30€)` : null,
        isLateReturn(returnTime) ? `Late return ${returnTime} (+30€)` : null,
      ]
        .filter(Boolean)
        .join("; ");
      const notesOut = [(form.notes ?? "").trim(), addonNote].filter(Boolean).join(" | ");
      if (notesOut) fd.set("notes", notesOut);
      fd.set("from", toIsoDate(effectiveRange.from));
      fd.set("to", toIsoDate(effectiveRange.to));
      fd.set("pickupTime", pickupTime);
      fd.set("returnTime", returnTime);
      if (!online) fd.set("paymentMethod", paymentMethod);
      fd.set("driversLicence", driversLicence);
      if (licenceCountry.trim()) fd.set("licenceCountry", licenceCountry.trim());
      fd.set("ridingStyle", ridingStyle);
      fd.set("totalPriceCents", String(totalPrice * 100));
      fd.set("locale", lang);
      if (online) {
        fd.set("payOnline", "1");
      } else if (receipt) {
        fd.set("receipt", receipt);
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body?.error === "string"
            ? body.error
            : tF.reservation.uploadError;
        setSubmitError(message);
        setBookingStep("form");
        return;
      }

      if (!online) {
        setBookingStep("done");
        setTimeout(() => {
          successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return;
      }

      // Online path: booking is reserved (pending). Create the checkout,
      // then hand off to the SumUp widget below.
      const okBody = (await res.json()) as { bookingId?: string };
      const bookingId = okBody.bookingId;
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
        setSubmitError(coBody.error ?? tF.reservation.uploadError);
        setBookingStep("form");
        return;
      }
      setCheckoutId(coBody.widgetCheckoutId);
      setCheckoutAmountCents(coBody.amountCents ?? 0);
      setBookingStep("paying");
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err) {
      console.error("booking submit failed", err);
      setSubmitError(tF.reservation.uploadError);
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
    setDriversLicence("");
    setRidingStyle("");
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
      setReceiptError(tF.reservation.uploadHint);
      e.target.value = "";
      setReceipt(null);
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setReceiptError(tF.reservation.fileTooLarge);
      e.target.value = "";
      setReceipt(null);
      return;
    }
    setReceipt(file);
  }

  const bookingFee = Math.round(totalPrice * 0.2 * 100) / 100;
  const canSubmit =
    bookingStep === "form" &&
    (payMode !== "screenshot" || (!!receipt && !receiptError)) &&
    !!driversLicence &&
    !!ridingStyle;

  const specs: { label: string; value: string }[] = [
    { label: tF.specs.engine, value: bike.displacement },
    { label: tF.specs.power, value: bike.power },
    { label: tF.specs.topSpeed, value: bike.maxSpeed },
    { label: tF.specs.tank, value: bike.tank },
    { label: tF.specs.consumption, value: bike.consumption },
    { label: tF.specs.range, value: bike.range },
    { label: tF.specs.seats, value: String(bike.seats) },
    { label: tF.specs.year, value: bike.year },
  ];

  const tiers: { label: string; sub: string; price: string }[] = [
    { label: tF.pricing.daily, sub: tF.pricing.dailySub, price: bike.pricing.day },
    { label: tF.pricing.weekend, sub: tF.pricing.weekendSub, price: bike.pricing.weekend },
    { label: tF.pricing.week, sub: tF.pricing.weekSub, price: bike.pricing.week },
    { label: tF.pricing.month, sub: tF.pricing.monthSub, price: bike.pricing.month },
  ];

  const inputClass =
    "mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white placeholder-ink/25 focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all";

  return (
    <>
      <Navbar lang={lang} t={dict.nav} />

      <main className="pt-32 pb-20 md:pb-16 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="mb-6 flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-muted">
            <Link href={`/${lang}`} className="hover:text-red transition-colors">{dict.nav.home}</Link>
            <span>/</span>
            <Link href={`/${lang}/#fleet`} className="hover:text-red transition-colors">{dict.nav.fleet}</Link>
            <span>/</span>
            <span className="text-ink">{bike.model}</span>
          </div>

          {/* Hero - image + title */}
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
                {tBike?.longDescription ?? bike.longDescription}
              </p>

              <div className="border-l-2 border-red pl-4 py-1 mb-7">
                <p className="text-ink text-sm font-semibold italic">
                  {tBike?.tagline ?? bike.tagline}
                </p>
              </div>

              {unitCount > 1 && (
                <div className="flex items-start gap-3 bg-sand px-4 py-3 mb-6">
                  <svg
                    className="w-5 h-5 text-ink shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                    />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-ink">
                      {(tF.inStock as string).replace("{n}", String(unitCount))}
                    </p>
                    <p className="text-xs text-muted leading-snug">
                      {(tF.inStockHint as string).replace("{n}", String(unitCount))}
                    </p>
                    <Link
                      href={`/${lang}/group`}
                      className="inline-block mt-1.5 text-xs font-bold text-red hover:underline"
                    >
                      {tF.inStockCta as string}
                    </Link>
                  </div>
                </div>
              )}

              <div className="bg-ink text-white p-6 mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  {bike.priceFrom && (
                    <span className="text-white/50 text-xs tracking-widest uppercase mr-1">
                      {tF.priceBox.perDay.includes("from") ? "" : tF.pricing.fromPrefix}
                    </span>
                  )}
                  <span className="font-barlow font-black text-5xl text-red">
                    {bike.pricing.day}
                  </span>
                  <span className="text-white/50 text-sm">{tF.priceBox.perDay}</span>
                </div>
                <p className="text-white/60 text-xs tracking-wider uppercase">
                  {tF.priceBox.unlimitedLine.replace("{deposit}", BRAND.deposit)}
                </p>
                {/* Helmets are the #1 thing customers ask about — surface
                    it as a bold badge on every model so nobody has to ask. */}
                <p className="mt-2.5 inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 text-xs font-bold tracking-wide uppercase px-2.5 py-1 rounded">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {tF.priceBox.helmetsIncluded}
                </p>

                <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-3">
                  <div className="bg-red text-white font-barlow font-black text-lg leading-none px-2.5 py-1.5 shrink-0">
                    {tF.priceBox.dayBadge}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-red font-bold mb-1">
                      {tF.priceBox.dayLabel}
                    </p>
                    <p className="text-white text-sm leading-snug">
                      {tF.priceBox.dayCopy}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-red font-bold mb-1">
                      {tF.priceBox.licenceEyebrow}
                    </p>
                    <p className="text-white text-sm font-semibold leading-snug">
                      {tF.licenceByCode[bike.licenceCode as keyof typeof tF.licenceByCode] ?? bike.licence}
                    </p>
                    <p className="text-white/50 text-xs leading-snug mt-1">
                      {tF.priceBox.bringLicence}
                    </p>
                  </div>
                  <Image
                    src={LICENCE_BADGE[bike.licenceCode]}
                    alt={`${bike.licenceCode} licence required`}
                    width={240}
                    height={240}
                    quality={100}
                    className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 drop-shadow-lg"
                  />
                </div>
              </div>

              {bike.experienceNote && (
                <div className="bg-sand px-4 py-3 mb-6 border-l-2 border-red text-xs">
                  <p className="text-ink leading-relaxed">
                    <span className="font-bold uppercase tracking-wider text-[10px] mr-2">{tF.headsUp}</span>
                    {tBike && "experienceNote" in tBike ? tBike.experienceNote : bike.experienceNote}
                  </p>
                </div>
              )}

              <button
                onClick={scrollToCalendar}
                className="inline-flex items-center justify-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-5 hover:bg-red-dark transition-colors"
              >
                {tF.checkAvailability}
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
                {tF.specs.eyebrow}
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-ink">
                {tF.specs.title}
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
                {tF.pricing.eyebrow}
              </p>
              <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-white">
                {tF.pricing.title}
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
                {tF.pricing.unlimitedKm}
              </div>
              <p className="text-white/50 text-xs">
                {tF.pricing.depositLine.replace("{deposit}", "").replace("{season}", "").replace("· ·", "·")}
                <span className="text-white">{BRAND.deposit}</span> · <span className="text-white">{tF.specsSection.seasonValue}</span>
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
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">{tF.specsSection.noPhoneHoldersLabel}</p>
                <p className="text-ink text-sm leading-snug">{tF.specsSection.noPhoneHoldersText}</p>
              </div>
            </div>
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">{tF.specsSection.depositLabel}</p>
                <p className="text-ink text-sm leading-snug">{tF.specsSection.depositText.replace("{deposit}", BRAND.deposit)}</p>
              </div>
            </div>
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">{tF.specsSection.seasonLabel}</p>
                <p className="text-ink text-sm leading-snug">{tF.specsSection.seasonText.replace("{season}", tF.specsSection.seasonValue)}</p>
              </div>
            </div>
            <div className="bg-off-white px-5 py-5 flex items-start gap-3">
              <svg className="w-5 h-5 text-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted mb-1">{tF.specsSection.fuelLabel}</p>
                <p className="text-ink text-sm leading-snug">{tF.specsSection.fuelText}</p>
              </div>
            </div>
          </section>

          {/* Cross-sell: book several different bikes in one go */}
          <Link
            href={`/${lang}/group`}
            className="mb-12 flex items-center justify-between gap-4 bg-ink text-white px-6 py-5 hover:bg-red transition-colors"
          >
            <span className="text-sm sm:text-base font-semibold">
              {dict.nav.groupBookingLead}
            </span>
            <span className="text-xs font-bold tracking-widest uppercase whitespace-nowrap">
              {dict.nav.groupBooking} →
            </span>
          </Link>

          {/* Booking flow - calendar + form + success */}
          <section id="book" ref={calendarRef} className="mb-16 scroll-mt-28">
            {bookingStep !== "done" && (
              <>
                <div className="text-center mb-6">
                  <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
                    {tF.calendar.eyebrow}
                  </p>
                  <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-ink">
                    {tF.calendar.title}
                  </h2>
                </div>

                {/* Freestanding bike strip so the visitor sees exactly
                    which bike's calendar they're about to lock. On desktop
                    the large image beside the calendar replaces it. */}
                <div className="flex items-center gap-3 sm:gap-6 mb-8 lg:hidden">
                  <div className="relative w-14 h-14 sm:w-20 sm:h-20 shrink-0 overflow-hidden">
                    <Image
                      src={bike.image}
                      alt={bike.name}
                      fill
                      sizes="80px"
                      className="object-cover object-bottom"
                    />
                  </div>
                  <p className="font-barlow font-black uppercase text-base sm:text-3xl tracking-wide leading-tight text-ink break-words">
                    {bike.name}
                  </p>
                </div>

                {/* Fixed calendar column (was `auto`): with `auto` the track
                    grew to the widest child, so once a day is picked the time
                    selects + price summary rendered below the calendar (their
                    one-line max-content is wider than the calendar) ballooned
                    the column and crushed the bike image beside it (958px vs
                    170px image). Pinning the column to the two-month calendar's
                    natural width keeps it — and the image — stable when a day is
                    clicked; the sub-content just wraps within it. `overflow-x-auto`
                    on the calendar box stays as a safety net for wide locales. */}
                <div className="grid lg:grid-cols-[46rem_1fr] gap-6 items-start">
                <div>
                <div className="bg-white border border-ink/10 p-4 sm:p-6 overflow-x-auto flex justify-center">
                  <DayPicker
                    mode="range"
                    locale={dateLocale}
                    selected={range}
                    onSelect={setRange}
                    weekStartsOn={1}
                    numberOfMonths={isMobile ? 1 : 2}
                    // Cap navigation: no scrolling into past months, no
                    // jumping past next year's season either. Anyone
                    // booking >18 months ahead should use WhatsApp.
                    startMonth={new Date()}
                    endMonth={SEASON_END_DATE}
                    disabled={[
                      { before: new Date() },
                      { after: SEASON_END_DATE },
                      ...bookedFullDays,
                    ]}
                    excludeDisabled
                    min={1}
                    modifiers={{
                      bookedFull: bookedFullDays,
                      amRed: amRedDays,
                      pmRed: pmRedDays,
                      middleOnly: middleOnlyDays,
                    }}
                    modifiersClassNames={{
                      // Booked = red tint + strike so it reads as
                      // "blocked, can't pick this". Selector targets
                      // the disabled state explicitly so it beats
                      // the past-date disabled:bg-transparent on
                      // CSS specificity.
                      bookedFull:
                        "[&_button:disabled]:!bg-red-100 [&_button:disabled]:!text-red-700 [&_button:disabled]:!line-through",
                      // Half-red = bookable, but not the whole day. A DIAGONAL
                      // split reads as a mini day-timeline along the bottom-left
                      // (morning) to top-right (evening) axis; the red corner is
                      // the part with no pickup. Soft rose / sage so it's a
                      // gentle hint, not an alarm.
                      // morning blocked, free from later -> red in the bottom-left
                      amRed:
                        "[&_button]:!bg-[linear-gradient(45deg,#FBC4C4_0%,#FBC4C4_50%,#CDEEDB_50%,#CDEEDB_100%)]",
                      // afternoon blocked, free until earlier -> red in the top-right
                      pmRed:
                        "[&_button]:!bg-[linear-gradient(45deg,#CDEEDB_0%,#CDEEDB_50%,#FBC4C4_50%,#FBC4C4_100%)]",
                      // only a mid-day window free -> red both corners, green middle band
                      middleOnly:
                        "[&_button]:!bg-[linear-gradient(45deg,#FBC4C4_0%,#FBC4C4_30%,#CDEEDB_30%,#CDEEDB_70%,#FBC4C4_70%,#FBC4C4_100%)]",
                    }}
                    classNames={{
                      root: "font-sans",
                      months: "flex flex-col sm:flex-row gap-6",
                      month_caption: "flex items-center justify-center mb-4",
                      caption_label: "font-barlow font-bold uppercase tracking-wide text-ink text-base",
                      nav: "flex items-center gap-1",
                      button_previous:
                        "w-9 h-9 flex items-center justify-center text-ink/50 rounded-full hover:bg-red hover:text-white transition-colors cursor-pointer",
                      button_next:
                        "w-9 h-9 flex items-center justify-center text-ink/50 rounded-full hover:bg-red hover:text-white transition-colors cursor-pointer",
                      month_grid: "w-full border-collapse",
                      weekdays: "mb-2",
                      weekday: "text-[10px] font-bold tracking-widest text-ink/30 text-center py-1 w-9 uppercase",
                      week: "",
                      day: "text-center p-0.5",
                      day_button:
                        "w-9 h-9 text-sm font-medium text-ink transition-colors bg-emerald-50 hover:bg-emerald-100 cursor-pointer disabled:!bg-transparent disabled:text-ink/20 disabled:cursor-not-allowed disabled:hover:bg-transparent",
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

                {/* Tiny legend so the green/red colouring is
                    immediately obvious to a visitor scanning the
                    calendar for the first time. */}
                <div className="flex items-center justify-center gap-5 mt-3 text-[10px] tracking-[0.15em] uppercase font-bold text-ink/60">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-emerald-100 border border-emerald-300" aria-hidden />
                    {tF.calendar.legendFree}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 border border-ink/20 bg-[linear-gradient(45deg,#FBC4C4_50%,#CDEEDB_50%)]"
                      aria-hidden
                    />
                    {tF.calendar.legendPartial}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-red-100 border border-red-300" aria-hidden />
                    {tF.calendar.legendBooked}
                  </span>
                </div>

                {effectiveRange?.from && effectiveRange?.to && (
                  <>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                          {tF.calendar.pickupTime} · {format(effectiveRange.from, "EEE dd MMM", { locale: dateLocale })}
                        </span>
                        <select
                          value={pickupTime}
                          onChange={(e) => setPickupTime(e.target.value)}
                          disabled={pickupSlots.length === 0}
                          className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all disabled:bg-ink/5 disabled:text-ink/40"
                        >
                          {pickupSlots.map((s) => (
                            <option key={s} value={s}>
                              {isEarlyPickup(s) ? `${s}  (+30€)` : s}
                            </option>
                          ))}
                          {pickupSlots.length === 0 && (
                            <option value="">-</option>
                          )}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                          {tF.calendar.returnTime} · {format(effectiveRange.to, "EEE dd MMM", { locale: dateLocale })}
                        </span>
                        <select
                          value={returnTime}
                          onChange={(e) => setReturnTime(e.target.value)}
                          disabled={returnSlots.length === 0}
                          className="mt-1.5 w-full border border-ink/15 px-4 py-3 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red/30 focus:border-red transition-all disabled:bg-ink/5 disabled:text-ink/40"
                        >
                          {returnSlots.map((s) => (
                            <option key={s} value={s}>
                              {isLateReturn(s) ? `${s}  (+30€)` : s}
                            </option>
                          ))}
                          {returnSlots.length === 0 && (
                            <option value="">-</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <p className="text-muted text-xs mt-2">
                      {tF.calendar.shopHours}{pickupBase.length < buildPickupSlots().length || returnBase.length < buildSlots().length ? tF.calendar.tooClose : ""}. ({tF.calendar.timezone})
                    </p>

                    {pickupSlots.length === 0 || returnSlots.length === 0 ? (
                      // Range picked but no single unit is free for the whole window
                      // (matches the multi-booking view's "0 free" state). Show the same
                      // "not available in this window" copy and push the customer to the
                      // multi-booking view where alternative bikes are surfaced.
                      <div className="mt-4 bg-red-50 border border-red-200 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-red-700 font-bold text-sm uppercase tracking-wide">
                            {tF.calendar.notAvailableInWindow}
                          </p>
                          <p className="text-red-800/80 text-xs mt-1">
                            {tF.calendar.notAvailableHint}
                          </p>
                        </div>
                        <Link
                          href={`/${lang}/group`}
                          className="bg-red text-white font-bold text-xs tracking-widest uppercase px-5 py-3 hover:bg-red-dark transition-colors whitespace-nowrap"
                        >
                          {tF.calendar.notAvailableCta} →
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-4 bg-sand px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="text-sm text-ink">
                          <span className="font-semibold">
                            {format(effectiveRange.from, "dd MMM", { locale: dateLocale })} {pickupTime}
                          </span>
                          {" → "}
                          <span className="font-semibold">
                            {format(effectiveRange.to, "dd MMM yyyy", { locale: dateLocale })} {returnTime}
                          </span>
                          {billableDays > 0 && (
                            <span className="text-muted ml-2">
                              ({billableDays === 1 ? tF.calendar.totalDay : tF.calendar.totalDays.replace("{n}", String(billableDays))})
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
                                {tF.tierLabel[appliedTier]}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                </div>

                <aside className="hidden lg:block relative aspect-[4/3] bg-sand overflow-hidden lg:sticky lg:top-28">
                  <Image
                    src={bike.image}
                    alt={bike.name}
                    fill
                    sizes="(min-width: 1024px) 40vw, 0px"
                    className="object-cover"
                  />
                </aside>
                </div>

                {bookingStep === "dates" && (
                  <div className="mt-5 flex justify-end">
                    <button
                      disabled={
                        !effectiveRange?.from ||
                        !effectiveRange?.to ||
                        pickupSlots.length === 0 ||
                        returnSlots.length === 0 ||
                        !pickupTime ||
                        !returnTime ||
                        totalPrice === 0
                      }
                      onClick={handleContinueToForm}
                      className="bg-red text-white font-bold text-xs tracking-widest uppercase px-8 py-4 hover:bg-red-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      {tF.calendar.continue} →
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
                    {tF.form.title}
                  </h2>
                </div>

                <div className="bg-ink text-white px-5 py-4 mb-7 flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">{tF.success.summaryBike}</p>
                    <p className="font-semibold mt-0.5">{bike.model}</p>
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">{tF.success.summaryFrom}</p>
                    <p className="font-semibold mt-0.5">
                      {effectiveRange?.from ? `${format(effectiveRange.from, "dd MMM yyyy", { locale: dateLocale })} · ${pickupTime}` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">{tF.success.summaryTo}</p>
                    <p className="font-semibold mt-0.5">
                      {effectiveRange?.to ? `${format(effectiveRange.to, "dd MMM yyyy", { locale: dateLocale })} · ${returnTime}` : "-"}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">{tF.success.summaryTotal}</p>
                    <p className="font-barlow font-black text-red text-2xl leading-none mt-0.5">
                      {totalPrice}€
                    </p>
                  </div>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {tF.form.name} *
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
                        {tF.form.email} *
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
                      {tF.form.phone} *
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {tF.form.licence} *
                      </span>
                      <select
                        required
                        value={driversLicence}
                        onChange={(e) => setDriversLicence(e.target.value as Licence | "")}
                        className={inputClass}
                      >
                        <option value="" disabled>
                          {tF.form.licencePlaceholder}
                        </option>
                        {LICENCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {tF.form.licenceOptions[o.value as keyof typeof tF.form.licenceOptions] ?? o.value}
                          </option>
                        ))}
                      </select>
                      <p className="text-muted text-xs mt-1.5">
                        <span className="font-semibold text-ink">{tF.licenceByCode[bike.licenceCode as keyof typeof tF.licenceByCode] ?? bike.licence}</span>
                      </p>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {tF.form.licenceCountry}
                      </span>
                      <input
                        type="text"
                        value={licenceCountry}
                        onChange={(e) => setLicenceCountry(e.target.value)}
                        placeholder={tF.form.licenceCountryPlaceholder}
                        className={inputClass}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                        {tF.form.ridingStyle} *
                      </span>
                      <select
                        required
                        value={ridingStyle}
                        onChange={(e) => setRidingStyle(e.target.value as RidingStyleId | "")}
                        disabled={isSinglePassenger}
                        className={inputClass}
                      >
                        <option value="" disabled>
                          {tF.form.ridingStylePlaceholder}
                        </option>
                        <option value="solo">{tF.form.ridingStyleSolo}</option>
                        {!isSinglePassenger && (
                          <option value="with_passenger">{tF.form.ridingStyleWithPassenger}</option>
                        )}
                      </select>
                      <p className="text-muted text-xs mt-1.5">
                        {isSinglePassenger
                          ? tF.form.soloOnly
                          : tF.form.maxRiders.replace("{n}", String(bike.seats))}
                      </p>
                      {/* Owner warning: lying about riding experience
                          forfeits the deposit and the rental is refused. */}
                      <p className="text-red text-xs font-semibold mt-1.5 leading-snug">
                        * {tF.form.experienceWarning}
                      </p>
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em]">
                      {tF.form.notes}
                    </span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder={tF.form.notesPlaceholder}
                      rows={3}
                      className={`${inputClass} resize-none`}
                    />
                  </label>

                  {/* Reservation / payment section */}
                  <div className="border-t border-ink/10 pt-7 mt-2">
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="font-barlow font-bold uppercase text-lg tracking-tight text-ink">
                        {tF.reservation.title}
                      </h3>
                      <p className="text-muted text-xs">
                        {tF.reservation.lockBooking.replace("{total}", String(totalPrice))}
                      </p>
                    </div>
                    <p className="text-ink text-sm leading-relaxed mb-1">
                      {tF.reservation.instructions
                        .replace("{fee}", String(bookingFee))
                        .replace("{rest}", String(Math.round((totalPrice - bookingFee) * 100) / 100))}
                    </p>
                    <p className="text-muted text-xs mb-5">
                      {tF.reservation.noBooking}
                    </p>

                    {/* Pay-mode selector — only shown when online payment is
                        enabled. Deposit = 20% now + rest on-site; Full = pay
                        everything online; Screenshot = the classic transfer
                        + screenshot flow. */}
                    {onlinePayment && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
                        {([
                          { id: "deposit" as const, label: `Deposit 20% online`, hint: `${bookingFee}€ now, rest on-site` },
                          { id: "full" as const, label: `Full amount online`, hint: `${totalPrice}€ now, nothing on-site` },
                          { id: "screenshot" as const, label: `Manual transfer`, hint: `PayPal / Revolut + screenshot` },
                        ] satisfies Array<{ id: PayMode; label: string; hint: string }>).map((opt) => {
                          const selected = payMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setPayMode(opt.id)}
                              className={`text-left px-4 py-3 border transition-colors ${
                                selected
                                  ? "border-red bg-red/5"
                                  : "border-ink/15 bg-white hover:border-ink/30"
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
                                      {tF.reservation.recommended}
                                    </span>
                                  )}
                                </div>
                                {selected && (
                                  <div className="mt-2 space-y-3">
                                    {p.link && (
                                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                                        <a
                                          href={p.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center justify-center gap-2 bg-ink text-white text-[11px] font-bold tracking-widest uppercase px-4 py-2.5 hover:bg-red transition-colors"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                          </svg>
                                          {tF.reservation.payWith
                                            .replace("{amount}", String(bookingFee))
                                            .replace("{method}", p.label.split(" · ")[0])}
                                        </a>
                                        <div className="bg-white border border-ink/10 p-2 inline-block shrink-0 self-start sm:self-center">
                                          <QRCodeSVG value={p.link} size={96} level="M" />
                                        </div>
                                      </div>
                                    )}
                                    {p.value && (
                                    <div>
                                      {p.valueLabel && (
                                        <p className="text-[10px] tracking-[0.15em] uppercase text-muted mb-0.5">
                                          {p.valueLabel}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <code className="text-ink text-sm font-mono break-all">
                                          {p.value}
                                        </code>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            copyValue(p.valueCopy ?? p.value!, `${p.id}-value`);
                                          }}
                                          className="text-[10px] font-bold tracking-widest uppercase text-ink/60 hover:text-red transition-colors px-2 py-1 border border-ink/15 hover:border-red"
                                        >
                                          {copied === `${p.id}-value` ? `✓ ${tF.reservation.copied}` : tF.reservation.copy}
                                        </button>
                                      </div>
                                    </div>
                                    )}
                                    {p.subValue && (
                                      <div>
                                        {p.subValueLabel && (
                                          <p className="text-[10px] tracking-[0.15em] uppercase text-muted mb-0.5">
                                            {p.subValueLabel}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <code className="text-ink text-sm font-mono break-all">
                                            {p.subValue}
                                          </code>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              copyValue(p.subValue!, `${p.id}-sub`);
                                            }}
                                            className="text-[10px] font-bold tracking-widest uppercase text-ink/60 hover:text-red transition-colors px-2 py-1 border border-ink/15 hover:border-red"
                                          >
                                            {copied === `${p.id}-sub` ? `✓ ${tF.reservation.copied}` : tF.reservation.copy}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {tF.reservation.paymentNotes[p.id] && (
                                  <p className="text-muted text-xs mt-1.5">
                                    {tF.reservation.paymentNotes[p.id]}
                                  </p>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-ink/50 uppercase tracking-[0.15em] mb-1.5">
                        {tF.reservation.uploadScreenshot} *
                      </p>
                      <input
                        id="receipt-file"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                        onChange={handleReceiptChange}
                        required
                        className="sr-only"
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <label
                          htmlFor="receipt-file"
                          className="inline-flex items-center cursor-pointer bg-ink text-white font-bold text-[10px] tracking-widest uppercase px-4 py-2.5 hover:bg-red transition-colors"
                        >
                          {tF.reservation.uploadPicked}
                        </label>
                        <span className="text-sm text-ink min-w-0 break-all">
                          {receipt ? (
                            <>
                              <span className="font-semibold">{receipt.name}</span>
                              <span className="text-muted ml-2">
                                ({(receipt.size / 1024).toFixed(0)} KB)
                              </span>
                            </>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </span>
                        {receipt && (
                          <button
                            type="button"
                            onClick={() => {
                              setReceipt(null);
                              setReceiptError(null);
                              const el = document.getElementById("receipt-file") as HTMLInputElement | null;
                              if (el) el.value = "";
                            }}
                            className="text-[10px] font-bold tracking-widest uppercase text-ink/60 hover:text-red transition-colors px-2 py-1 border border-ink/15 hover:border-red"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {receiptError && (
                        <p className="text-red text-xs mt-2 font-semibold">{receiptError}</p>
                      )}
                      <p className="text-muted text-xs mt-2">
                        {tF.reservation.uploadHint}
                      </p>
                    </div>
                    </>
                    )}
                  </div>

                  {submitError && (
                    <p className="text-red text-sm text-center font-semibold">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={bookingStep === "submitting" || !canSubmit}
                    className="w-full py-4 bg-red text-white font-bold text-xs tracking-widest uppercase hover:bg-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {bookingStep === "submitting"
                      ? tF.form.submitting
                      : payMode === "screenshot"
                        ? `${tF.form.submit} →`
                        : `Continue to payment →`}
                  </button>

                  <p className="text-center text-muted text-xs">
                    {tF.form.reviewLine}{" "}
                    <Link href={`/${lang}/terms`} target="_blank" className="text-red font-semibold underline">
                      {tF.form.termsLink}
                    </Link>
                    .
                  </p>
                </form>
              </div>
            )}

            {/* Pay by card (SumUp widget) */}
            {bookingStep === "paying" && pendingBookingId && checkoutId && (
              <div className="max-w-xl mx-auto space-y-4">
                <h2 className="font-barlow font-black uppercase text-2xl text-ink">
                  {payMode === "full" ? "Complete payment" : "Deposit payment"}
                </h2>
                <p className="text-sm text-muted">
                  {payMode === "full"
                    ? "Pay the full rental now to confirm the booking."
                    : "Pay the 20% deposit to confirm the booking. The rest is due on arrival."}
                </p>
                <SumUpCardWidget
                  bookingId={pendingBookingId}
                  checkoutId={checkoutId}
                  amountCents={checkoutAmountCents}
                  currency="EUR"
                  locale={lang}
                  onPaid={() => {
                    setBookingStep("done");
                    setTimeout(() => {
                      successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  onFail={(msg) => setSubmitError(msg)}
                />
                {submitError && <p className="text-xs text-red font-medium">{submitError}</p>}
              </div>
            )}

            {/* Success */}
            {bookingStep === "done" && (
              <div ref={successRef} className="text-center scroll-mt-28 max-w-xl mx-auto">
                <div className="success-pop inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500 mb-6">
                  <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path className="success-draw" strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,8vw,5rem)] leading-none tracking-tight text-ink mb-4">
                  {tF.success.title}
                </h2>
                <p className="text-ink text-base leading-relaxed mb-2">
                  {form.name && `${form.name}. `}{tF.success.intro.replace("{ref}", "")}
                </p>

                <div className="bg-sand px-5 py-4 mb-10 text-left text-sm">
                  <p className="text-ink"><span className="text-muted">{tF.success.summaryBike}: </span>{bike.model}</p>
                  {effectiveRange?.from && effectiveRange?.to && (
                    <>
                      <p className="text-ink">
                        <span className="text-muted">{tF.success.summaryFrom}: </span>
                        {format(effectiveRange.from, "dd MMM yyyy", { locale: dateLocale })} · {pickupTime}
                      </p>
                      <p className="text-ink">
                        <span className="text-muted">{tF.success.summaryTo}: </span>
                        {format(effectiveRange.to, "dd MMM yyyy", { locale: dateLocale })} · {returnTime}
                      </p>
                    </>
                  )}
                  {totalPrice > 0 && (
                    <p className="text-ink"><span className="text-muted">{tF.success.summaryTotal}: </span>{totalPrice}€</p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href={`/${lang}/#fleet`}
                    className="bg-ink text-white font-bold text-xs tracking-widest uppercase px-7 py-3 hover:bg-red transition-colors"
                  >
                    {tF.success.back}
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* Bottom CTA: push visitors into the on-page assistant first
              (Thomas: bot conversation is the funnel, WhatsApp lives only in
              the contact area as the last escalation). */}
          {bookingStep !== "done" && (
            <section className="bg-red text-white px-8 md:px-12 py-12 md:py-16 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div>
                <p className="text-white/60 text-xs tracking-widest uppercase mb-3">
                  {dict.faq.eyebrow}
                </p>
                <h2 className="font-barlow font-black uppercase text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] tracking-tight">
                  {dict.chatbot.title}
                </h2>
                <p className="text-white/70 text-sm mt-3 max-w-md leading-snug">
                  {dict.chatbot.subtitle}
                </p>
              </div>
              <div className="shrink-0 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("open-chatbot"))}
                  className="inline-flex items-center justify-center gap-3 bg-white text-red font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-off-white transition-colors w-full md:w-auto"
                >
                  {dict.chatbot.openLabel} →
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer lang={lang} t={dict.footer} nav={dict.nav} />
    </>
  );
}
