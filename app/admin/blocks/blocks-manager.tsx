"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildSlots } from "@/lib/pricing";
import type { EnrichedBlock } from "@/lib/admin-data";

type Bike = { id: string; name: string };
type Unit = { id: string; label: string };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const SLOTS = buildSlots();

export function BlocksManager({
  initialBlocks,
  bikes,
  unitsByBike,
}: {
  initialBlocks: EnrichedBlock[];
  bikes: Bike[];
  unitsByBike: Record<string, Unit[]>;
}) {
  const router = useRouter();
  const [bikeId, setBikeId] = useState(bikes[0]?.id ?? "");
  // Unit id, or "" for "auto-pick" (walk-in) / "all" for whole-model block.
  const [unitChoice, setUnitChoice] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pickupTime, setPickupTime] = useState("09:00");
  const [returnTime, setReturnTime] = useState("19:00");
  const [reason, setReason] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const availableUnits = useMemo(
    () => unitsByBike[bikeId] ?? [],
    [unitsByBike, bikeId],
  );

  // Customer name = "this is a walk-in booking"; empty = "service block"
  const hasCustomerInfo = customerName.trim().length > 0;

  function resetFields() {
    setDateFrom("");
    setDateTo("");
    setReason("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setNotes("");
    setPickupTime("09:00");
    setReturnTime("19:00");
    setUnitChoice("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bikeId || !dateFrom || !dateTo) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (hasCustomerInfo) {
        // Walk-in booking. "all" doesn't make sense here — fall back
        // to auto-pick if the owner left it on that choice.
        const wantedUnit = unitChoice && unitChoice !== "all" ? unitChoice : undefined;
        const res = await fetch("/api/admin/bookings/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bikeId,
            bikeUnitId: wantedUnit,
            dateFrom,
            dateTo,
            pickupTime,
            returnTime,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim() || undefined,
            customerEmail: customerEmail.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error || "Could not save booking");
          setBusy(false);
          return;
        }
        setInfo("Booking saved — it now shows in the dashboard.");
      } else {
        // Service / repair block. "all" = whole-model block (no unit
        // id). Anything else = single unit. Empty = same as "all"
        // for backward compat but we treat "" as "pick first unit"
        // is too surprising — require an explicit choice via UI.
        const targetUnitId =
          unitChoice && unitChoice !== "all" ? unitChoice : undefined;
        const res = await fetch("/api/admin/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bikeId,
            bikeUnitId: targetUnitId,
            dateFrom,
            dateTo,
            reason: reason.trim() || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error || "Could not add block");
          setBusy(false);
          return;
        }
        setInfo(
          targetUnitId
            ? "Service block added — other units of this model stay bookable."
            : "Whole-model block added.",
        );
      }
      resetFields();
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
        onSubmit={submit}
        className="bg-white border border-ink/10 p-5 mb-8 space-y-5"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
              Bike model
            </span>
            <select
              value={bikeId}
              onChange={(e) => {
                setBikeId(e.target.value);
                setUnitChoice("");
              }}
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
              Unit
            </span>
            <select
              value={unitChoice}
              onChange={(e) => setUnitChoice(e.target.value)}
              className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
            >
              <option value="">
                {hasCustomerInfo ? "Auto-pick free unit" : "— pick a unit —"}
              </option>
              {availableUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
              <option value="all">All units (whole model)</option>
            </select>
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
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
        </div>

        <div
          className={`grid sm:grid-cols-2 gap-3 transition-opacity ${
            hasCustomerInfo ? "opacity-100" : "opacity-60"
          }`}
        >
          <label className="block">
            <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
              Pickup time
            </span>
            <select
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              disabled={!hasCustomerInfo}
              className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white disabled:bg-ink/5"
            >
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
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
              disabled={!hasCustomerInfo}
              className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white disabled:bg-ink/5"
            >
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pt-2 border-t border-ink/8">
          <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-3">
            Service block (no customer)
          </p>
          <label className="block">
            <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
              Reason
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z.B. Bremse reparieren, Service, privat"
              className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="pt-2 border-t border-ink/8">
          <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-3">
            Walk-in booking (optional)
          </p>
          <p className="text-xs text-muted mb-4 max-w-prose">
            Fill in the customer name to record this as a real booking
            (shows up in the dashboard). Leave empty for a service block.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                Customer name
              </span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="—"
                className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                Phone
              </span>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="—"
                className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                Email
              </span>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="—"
                className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block mt-3">
            <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="—"
              className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-xs text-muted">
            {hasCustomerInfo
              ? unitChoice && unitChoice !== "all"
                ? "Walk-in booking on this specific unit."
                : "Walk-in booking — system picks a free unit."
              : unitChoice === "all"
                ? "Whole-model block (all units unavailable)."
                : unitChoice
                  ? "Service block on this specific unit."
                  : "Pick a unit (or All units) to block."}
          </p>
          <button
            type="submit"
            disabled={busy || (!hasCustomerInfo && !unitChoice)}
            className="bg-red text-white font-bold text-xs tracking-widest uppercase px-5 py-2.5 hover:bg-red-dark disabled:opacity-50"
          >
            {busy ? "Saving…" : hasCustomerInfo ? "Save booking" : "Add block"}
          </button>
        </div>
      </form>

      {error && (
        <p className="text-red text-sm font-semibold mb-4">{error}</p>
      )}
      {info && !error && (
        <p className="text-emerald-700 text-sm font-semibold mb-4">{info}</p>
      )}

      <h2 className="font-barlow font-black uppercase text-lg tracking-tight text-ink mb-3">
        Active blocks
      </h2>
      {initialBlocks.length === 0 ? (
        <p className="text-sm text-muted">No blocks set.</p>
      ) : (
        <div className="space-y-2">
          {initialBlocks.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between bg-white border border-ink/10 px-4 py-3 gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink truncate flex items-center gap-2">
                  <span>{b.bikeName}</span>
                  {b.unitLabel ? (
                    <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-ink/40">
                      {b.unitLabel}
                    </span>
                  ) : (
                    <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-red/70">
                      all units
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {fmtDate(b.date_from)} → {fmtDate(b.date_to)}
                  {b.reason && (
                    <span className="ml-2 text-ink/70 italic">· {b.reason}</span>
                  )}
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
