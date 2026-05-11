"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingRow } from "@/lib/bike-pricing";

type RowState = PricingRow & { draft: string; saving: boolean; saved: boolean; error: string | null };

function toRowState(r: PricingRow): RowState {
  return { ...r, draft: String(r.dayPrice), saving: false, saved: false, error: null };
}

export function PricingManager({ initial }: { initial: PricingRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => initial.map(toRowState));

  function update(bikeId: string, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r.bikeId === bikeId ? { ...r, ...patch } : r)));
  }

  async function save(row: RowState) {
    const parsed = parseInt(row.draft, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      update(row.bikeId, { error: "Enter a positive number", saved: false });
      return;
    }
    update(row.bikeId, { saving: true, error: null, saved: false });
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bikeId: row.bikeId, dayPrice: parsed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        update(row.bikeId, { saving: false, error: body?.error || "Save failed" });
        return;
      }
      update(row.bikeId, {
        saving: false,
        saved: true,
        hasOverride: true,
        dayPrice: parsed,
      });
      router.refresh();
      setTimeout(() => update(row.bikeId, { saved: false }), 2000);
    } catch {
      update(row.bikeId, { saving: false, error: "Network error" });
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const dirty = r.draft !== String(r.dayPrice);
        return (
          <div
            key={r.bikeId}
            className="bg-white border border-ink/10 px-4 py-3 grid grid-cols-[1fr_auto_auto] items-center gap-3"
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
            <label className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={r.draft}
                onChange={(e) => update(r.bikeId, { draft: e.target.value, saved: false, error: null })}
                className="w-20 border border-ink/15 px-2 py-1.5 text-right text-sm font-bold"
              />
              <span className="text-sm text-muted">€/day</span>
            </label>
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
