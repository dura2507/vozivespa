"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingRow } from "@/lib/bike-pricing";

type TierKey = "day" | "weekend" | "week" | "month";
// Off-season = April-May and September-October; main season = June-August
// (lib/pricing.ts isPeakDay). Each rental day costs its own season's price.
type Season = "off" | "peak";
const SEASONS: Season[] = ["off", "peak"];

// value = the saved price; null only in the main season, where it means "no
// own price": the field stays empty and the price that then applies (see
// peakFallback) shows in grey as the placeholder.
type TierState = { value: number | null; draft: string };

type RowState = {
  bikeId: string;
  bikeName: string;
  tiers: Record<Season, Record<TierKey, TierState>>;
  peakDefault: Record<TierKey, number | null>;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

const TIER_KEYS: TierKey[] = ["day", "weekend", "week", "month"];

function toRowState(r: PricingRow): RowState {
  const off = { day: r.dayPrice, weekend: r.weekendPrice, week: r.weekPrice, month: r.monthPrice };
  const tiers = { off: {}, peak: {} } as Record<Season, Record<TierKey, TierState>>;
  for (const k of TIER_KEYS) {
    tiers.off[k] = { value: off[k], draft: String(off[k]) };
    const own = r.hasPeakOverride[k] ? r.peak[k] : null;
    tiers.peak[k] = { value: own, draft: own === null ? "" : String(own) };
  }
  return {
    bikeId: r.bikeId,
    bikeName: r.bikeName,
    tiers,
    peakDefault: r.peakDefault,
    saving: false,
    saved: false,
    error: null,
  };
}

// The main-season price of a tier WITHOUT an own value: the preset June-August
// price if the bike has one, else the saved off-season price (lib/pricing.ts
// parsePeak).
const peakFallback = (r: RowState, k: TierKey): number =>
  r.peakDefault[k] ?? (r.tiers.off[k].value as number);

const shown = (t: TierState) => (t.value === null ? "" : String(t.value));
const isDirty = (t: TierState) => t.draft.trim() !== shown(t);

const SEASON_LABELS: Record<Season, string> = {
  off: "Off-season (Apr-May, Sep-Oct)",
  peak: "Main season (Jun-Aug)",
};

const TIER_LABELS: Record<TierKey, string> = {
  day: "Day",
  weekend: "Weekend",
  week: "Week",
  month: "Month",
};

const API_KEYS: Record<Season, Record<TierKey, string>> = {
  off: { day: "dayPrice", weekend: "weekendPrice", week: "weekPrice", month: "monthPrice" },
  peak: { day: "peakDayPrice", weekend: "peakWeekendPrice", week: "peakWeekPrice", month: "peakMonthPrice" },
};

export function PricingManager({ initial }: { initial: PricingRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => initial.map(toRowState));
  const [season, setSeason] = useState<Season>("off");

  // After a save, router.refresh() sends fresh rows: take them over (the grey
  // main-season prices follow a changed off-season price), but keep anything
  // still being typed.
  useEffect(() => {
    setRows((rs) =>
      initial.map((p) => {
        const fresh = toRowState(p);
        const old = rs.find((o) => o.bikeId === p.bikeId);
        if (!old) return fresh;
        for (const s of SEASONS) {
          for (const k of TIER_KEYS) {
            if (isDirty(old.tiers[s][k])) fresh.tiers[s][k] = { ...fresh.tiers[s][k], draft: old.tiers[s][k].draft };
          }
        }
        return { ...fresh, saving: old.saving, saved: old.saved, error: old.error };
      }),
    );
  }, [initial]);

  function patch(bikeId: string, mut: (r: RowState) => RowState) {
    setRows((rs) => rs.map((r) => (r.bikeId === bikeId ? mut(r) : r)));
  }

  function updateDraft(bikeId: string, s: Season, key: TierKey, draft: string) {
    patch(bikeId, (r) => ({
      ...r,
      tiers: { ...r.tiers, [s]: { ...r.tiers[s], [key]: { ...r.tiers[s][key], draft } } },
      saved: false,
      error: null,
    }));
  }

  // Save covers the whole row, both seasons, so nothing typed in the other
  // tab is silently left unsaved.
  function dirtyFields(r: RowState): Array<[Season, TierKey]> {
    return SEASONS.flatMap((s) => TIER_KEYS.filter((k) => isDirty(r.tiers[s][k])).map((k) => [s, k] as [Season, TierKey]));
  }

  async function save(row: RowState) {
    const changed = dirtyFields(row);
    if (changed.length === 0) return;

    // Validate + build the body. Only send dirty fields. An emptied
    // main-season field is sent as null: back to the grey price.
    const body: Record<string, number | string | null> = { bikeId: row.bikeId };
    const parsed = new Map<string, number | null>();
    for (const [s, key] of changed) {
      const draft = row.tiers[s][key].draft.trim();
      let n: number | null = null;
      // Only a really empty main-season field means "back to the grey
      // price"; anything else must be whole euros (the fields are text, so
      // "480€" reaches this check instead of turning into "").
      if (!(s === "peak" && draft === "")) {
        n = /^\d+$/.test(draft) ? Number(draft) : NaN;
        if (!Number.isFinite(n) || n <= 0) {
          patch(row.bikeId, (r) => ({
            ...r,
            error: `${s === "peak" ? "Main season " : ""}${TIER_LABELS[key]}: enter a positive number`,
            saved: false,
          }));
          return;
        }
      }
      parsed.set(`${s}:${key}`, n);
      body[API_KEYS[s][key]] = n;
    }

    patch(row.bikeId, (r) => ({ ...r, saving: true, error: null, saved: false }));
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(row.bikeId, (r) => ({ ...r, saving: false, error: data?.error || "Save failed" }));
        return;
      }
      patch(row.bikeId, (r) => {
        const tiers = { off: { ...r.tiers.off }, peak: { ...r.tiers.peak } };
        for (const [s, k] of changed) {
          const v = parsed.get(`${s}:${k}`) ?? null;
          tiers[s][k] = { value: v, draft: v === null ? "" : String(v) };
        }
        return { ...r, tiers, saving: false, saved: true };
      });
      router.refresh();
      setTimeout(() => patch(row.bikeId, (r) => ({ ...r, saved: false })), 2000);
    } catch {
      patch(row.bikeId, (r) => ({ ...r, saving: false, error: "Network error" }));
    }
  }

  const seasonHasEdits = (s: Season) => rows.some((r) => TIER_KEYS.some((k) => isDirty(r.tiers[s][k])));

  return (
    <div className="space-y-3">
      {/* Season tabs: the same grid, once per season. A dot marks unsaved
          changes in a tab. */}
      <div className="flex flex-wrap gap-2 mb-2" role="tablist" aria-label="Season">
        {SEASONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={season === s}
            onClick={() => setSeason(s)}
            className={`text-xs font-bold tracking-widest uppercase px-4 py-2 border transition-colors ${
              season === s ? "bg-ink text-white border-ink" : "bg-white text-ink/60 border-ink/15 hover:text-ink"
            }`}
          >
            {SEASON_LABELS[s]}
            {season !== s && seasonHasEdits(s) ? " •" : ""}
          </button>
        ))}
      </div>
      {season === "peak" && (
        <p className="text-xs text-muted mb-2 max-w-prose">
          June to August. A rental that runs across 1 June or 1 September pays each day at
          its own season&apos;s price. An empty field uses the price shown in grey: the
          off-season price, or the preset June to August day price of that bike. Type a
          price to set your own; clear the field to go back to the grey price.
        </p>
      )}
      {/* Column header (desktop only — too tight on mobile, columns
          self-explain via their labels). */}
      <div className="hidden md:grid grid-cols-[1.5fr_repeat(4,minmax(0,1fr))_auto] gap-3 text-[10px] uppercase tracking-[0.15em] text-ink/50 font-bold px-4">
        <span>Bike</span>
        <span>Day €</span>
        <span>Weekend €</span>
        <span>Week €</span>
        <span>Month €</span>
        <span />
      </div>
      {rows.map((r) => {
        const dirty = dirtyFields(r).length > 0;
        return (
          <div
            key={r.bikeId}
            className="bg-white border border-ink/10 px-4 py-3 grid grid-cols-1 md:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))_auto] items-start md:items-center gap-3"
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">{r.bikeName}</p>
              {(r.error || r.saved) && (
                <p className="text-[10px] tracking-[0.15em] uppercase font-bold mt-0.5">
                  {r.error && <span className="text-red">{r.error}</span>}
                  {r.saved && <span className="text-green-600">Saved</span>}
                </p>
              )}
            </div>
            {TIER_KEYS.map((k) => (
              <input
                key={`${season}-${k}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={r.tiers[season][k].draft}
                placeholder={season === "peak" ? String(peakFallback(r, k)) : undefined}
                onChange={(e) => updateDraft(r.bikeId, season, k, e.target.value)}
                aria-label={`${r.bikeName} ${TIER_LABELS[k]} price, ${SEASON_LABELS[season]}`}
                className="w-full border border-ink/15 px-2 py-1.5 text-right text-sm font-bold placeholder:text-ink/35 placeholder:font-normal"
              />
            ))}
            <button
              type="button"
              onClick={() => save(r)}
              disabled={!dirty || r.saving}
              className="bg-red text-white font-bold text-xs tracking-widest uppercase px-4 py-2 hover:bg-red-dark disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {r.saving ? "Saving…" : "Save"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
