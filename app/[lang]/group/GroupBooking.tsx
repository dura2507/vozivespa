"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { enUS, de, es, it, hr } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Category } from "@/lib/mockData";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { buildSlots, calculatePrice } from "@/lib/pricing";
import { SEASON_END_DATE } from "@/lib/season";

const SLOTS = buildSlots();

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

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

type FleetAvail = { totalUnits: number; freeUnits: number; nextFree: { from: string; to: string } | null };

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
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"select" | "details">("select");

  const from = range?.from ? toIsoDate(range.from) : null;
  const to = range?.to ? toIsoDate(range.to) : null;
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

  // Per-bike total for the chosen window (one unit). Used for the card
  // price and the cart sum.
  const priceFor = useMemo(() => {
    return (bike: Category): number | null => {
      if (!range?.from || !range?.to) return null;
      const res = calculatePrice(range.from, range.to, pickupTime, returnTime, bike.pricing);
      return res ? res.totalPrice : null;
    };
  }, [range, pickupTime, returnTime]);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = useMemo(() => {
    let sum = 0;
    for (const bike of bikes) {
      const qty = cart[bike.id] ?? 0;
      if (qty <= 0) continue;
      const p = priceFor(bike);
      if (p != null) sum += p * qty;
    }
    return sum;
  }, [cart, bikes, priceFor]);

  function setQty(bikeId: string, qty: number) {
    const free = avail?.[bikeId]?.freeUnits ?? 0;
    const clamped = Math.max(0, Math.min(qty, free));
    setCart((c) => ({ ...c, [bikeId]: clamped }));
  }

  function useSuggestedDates(next: { from: string; to: string }) {
    setRange({ from: new Date(`${next.from}T00:00:00`), to: new Date(`${next.to}T00:00:00`) });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dfLocale = DATE_FNS_LOCALES[lang] ?? enUS;

  return (
    <>
      <Navbar lang={lang} t={dict.nav} />
      <main className="max-w-5xl mx-auto px-5 md:px-8 py-10">
        <h1 className="font-bold text-3xl md:text-4xl text-ink mb-2">
          Book multiple bikes
        </h1>
        <p className="text-sm text-muted mb-8 max-w-prose">
          Pick one date window, then add as many bikes as you need to a
          single booking with one deposit. We show the whole fleet so you
          can see what is free and when.
        </p>

        {/* Step 1: shared date window */}
        <div className="bg-white border border-ink/10 p-5 mb-6">
          <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-3">
            Your rental period
          </p>
          <div className="grid md:grid-cols-[auto_1fr] gap-6">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              locale={dfLocale}
              disabled={[{ before: today }, { after: SEASON_END_DATE }]}
              numberOfMonths={1}
            />
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  Pickup time
                </span>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  Return time
                </span>
                <select
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              {rangeReady && (
                <p className="text-sm text-ink pt-1">
                  {fmtDay(from!)} {pickupTime} → {fmtDay(to!)} {returnTime}
                </p>
              )}
            </div>
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
                const qty = cart[bike.id] ?? 0;
                const price = priceFor(bike);
                const soldOut = a != null && free === 0;
                return (
                  <div
                    key={bike.id}
                    className={`border border-ink/10 border-l-[3px] p-4 flex items-center gap-4 flex-wrap ${
                      soldOut ? "border-l-red bg-red/[0.03]" : "border-l-green-700"
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
                            <span className="text-ink font-normal">
                              {" "}· free {fmtDay(a.nextFree.from)}–{fmtDay(a.nextFree.to)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-green-800 font-medium mt-0.5">
                          {free} available for these dates
                        </div>
                      )}
                    </div>
                    {soldOut ? (
                      a?.nextFree ? (
                        <button
                          type="button"
                          onClick={() => useSuggestedDates(a.nextFree!)}
                          className="text-xs font-bold tracking-[0.08em] uppercase border border-ink/20 px-3 py-2 hover:border-red"
                        >
                          Use these dates
                        </button>
                      ) : (
                        <span className="text-xs text-muted uppercase tracking-[0.08em]">Unavailable</span>
                      )
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
                        .filter((b) => (cart[b.id] ?? 0) > 0)
                        .map((b) => `${b.model} × ${cart[b.id]}`)
                        .join(" · ")}
                </p>
                {cartCount > 0 && (
                  <p className="text-xs text-muted mt-0.5">{cartCount} bikes · one deposit</p>
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
              <div className="mt-6 border border-dashed border-ink/20 p-5 text-sm text-muted">
                Customer details + deposit step coming next (stage 2b-ii).
                Selected: {cartCount} bikes, total {cartTotal}€.
              </div>
            )}
          </>
        )}
      </main>
      <Footer lang={lang} t={dict.footer} nav={dict.nav} />
    </>
  );
}
