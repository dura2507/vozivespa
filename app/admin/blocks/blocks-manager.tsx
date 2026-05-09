"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedBlock } from "@/lib/admin-data";

type Bike = { id: string; name: string };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function BlocksManager({
  initialBlocks,
  bikes,
}: {
  initialBlocks: EnrichedBlock[];
  bikes: Bike[];
}) {
  const router = useRouter();
  const [bikeId, setBikeId] = useState(bikes[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!bikeId || !dateFrom || !dateTo) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bikeId, dateFrom, dateTo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Could not add block");
        setBusy(false);
        return;
      }
      setDateFrom("");
      setDateTo("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this block?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/blocks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "Could not delete");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    }
  }

  return (
    <>
      <form
        onSubmit={add}
        className="bg-white border border-ink/10 p-5 mb-8 grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end"
      >
        <label className="block">
          <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
            Bike
          </span>
          <select
            value={bikeId}
            onChange={(e) => setBikeId(e.target.value)}
            className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
          >
            {bikes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
            From
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            required
            className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
            To
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            required
            className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="bg-red text-white font-bold text-xs tracking-widest uppercase px-5 py-2.5 hover:bg-red-dark disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add block"}
        </button>
      </form>

      {error && (
        <p className="text-red text-sm font-semibold mb-4">{error}</p>
      )}

      {initialBlocks.length === 0 ? (
        <p className="text-sm text-muted">No manual blocks set.</p>
      ) : (
        <div className="space-y-2">
          {initialBlocks.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between bg-white border border-ink/10 px-4 py-3 gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{b.bikeName}</p>
                <p className="text-xs text-muted">
                  {fmtDate(b.date_from)} → {fmtDate(b.date_to)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(b.id)}
                className="text-xs font-bold tracking-widest uppercase text-ink/40 hover:text-red transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
