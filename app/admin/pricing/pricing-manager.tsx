"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingRow } from "@/lib/bike-pricing";

type TierKey = "day" | "weekend" | "week" | "month";

type TierState = { value: number; draft: string };

type RowState = {
  bikeId: string;
  bikeName: string;
  tiers: Record<TierKey, TierState>;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

function toRowState(r: PricingRow): RowState {
  return {
    bikeId: r.bikeId,
    bikeName: r.bikeName,
    tiers: {
      day: { value: r.dayPrice, draft: String(r.dayPrice) },
      weekend: { value: r.weekendPrice, draft: String(r.weekendPrice) },
      week: { value: r.weekPrice, draft: String(r.weekPrice) },
      month: { value: r.monthPrice, draft: String(r.monthPrice) },
    },
    saving: false,
    saved: false,
    error: null,
  };
}

const TIER_LABELS: Record<TierKey, string> = {
  day: "Day",
  weekend: "Weekend",
  week: "Week",
  month: "Month",
};

export function PricingManager({ initial }: { initial: PricingRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => initial.map(toRowState));

  function patch(bikeId: string, mut: (r: RowState) => RowState) {
    setRows((rs) => rs.map((r) => (r.bikeId === bikeId ? mut(r) : r)));
  }

  function updateDraft(bikeId: string, key: TierKey, draft: string) {
    patch(bikeId, (r) => ({
      ...r,
      tiers: { ...r.tiers, [key]: { ...r.tiers[key], draft } },
      saved: false,
      error: null,
    }));
  }

  function dirtyTiers(r: RowState): TierKey[] {
    return (Object.keys(r.tiers) as TierKey[]).filter(
      (k) => r.tiers[k].draft !== String(r.tiers[k].value),
    );
  }

  async function save(row: RowState) {
    const changed = dirtyTiers(row);
    if (changed.length === 0) return;

    // Validate + build the body. Only send dirty fields.
    const body: Record<string, number | string> = { bikeId: row.bikeId };
    const parsedByTier: Partial<Record<TierKey, number>> = {};
    for (const key of changed) {
      const n = parseInt(row.tiers[key].draft, 10);
      if (!Number.isFinite(n) || n <= 0) {
        patch(row.bikeId, (r) => ({
          ...r,
          error: `${TIER_LABELS[key]}: enter a positive number`,
          saved: false,
        }));
        return;
      }
      parsedByTier[key] = n;
      const apiKey =
        key === "day"
          ? "dayPrice"
          : key === "weekend"
            ? "weekendPrice"
            : key === "week"
              ? "weekPrice"
              : "monthPrice";
      body[apiKey] = n;
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
        const tiers = { ...r.tiers };
        for (const k of changed) {
          tiers[k] = { value: parsedByTier[k]!, draft: String(parsedByTier[k]) };
        }
        return { ...r, tiers, saving: false, saved: true };
      });
      router.refresh();
      setTimeout(() => patch(row.bikeId, (r) => ({ ...r, saved: false })), 2000);
    } catch {
      patch(row.bikeId, (r) => ({ ...r, saving: false, error: "Network error" }));
    }
  }

  return (
    <div className="space-y-3">
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
        const dirty = dirtyTiers(r).length > 0;
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
            {(Object.keys(r.tiers) as TierKey[]).map((k) => (
              <input
                key={k}
                type="number"
                inputMode="numeric"
                min={1}
                value={r.tiers[k].draft}
                onChange={(e) => updateDraft(r.bikeId, k, e.target.value)}
                aria-label={`${r.bikeName} ${TIER_LABELS[k]} price`}
                className="w-full border border-ink/15 px-2 py-1.5 text-right text-sm font-bold"
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
