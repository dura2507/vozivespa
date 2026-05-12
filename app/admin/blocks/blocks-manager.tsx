"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildSlots } from "@/lib/pricing";
import { groupBookingsForDisplay } from "@/lib/admin-data";
import type { EnrichedBlock, EnrichedBooking } from "@/lib/admin-data";

type Bike = { id: string; name: string };
type Unit = { id: string; label: string };

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const SLOTS = buildSlots();

export function BlocksManager({
  initialBlocks,
  initialWalkIns,
  bikes,
  unitsByBike,
}: {
  initialBlocks: EnrichedBlock[];
  initialWalkIns: EnrichedBooking[];
  bikes: Bike[];
  unitsByBike: Record<string, Unit[]>;
}) {
  const router = useRouter();
  const [bikeId, setBikeId] = useState(bikes[0]?.id ?? "");
  // List of unit ids the owner has ticked. Special value "all" =
  // master "All units" toggle is on (whole-model block / group
  // booking). Empty array on a walk-in means "auto-pick a free unit".
  const [unitChoices, setUnitChoices] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pickupTime, setPickupTime] = useState("09:00");
  const [returnTime, setReturnTime] = useState("19:00");
  // Service-block specific: when allDay is on, no time fields go to
  // the server (whole-day block). When off, the same pickupTime /
  // returnTime are sent as start_time / end_time.
  const [allDay, setAllDay] = useState(true);
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
  const isAllUnits = unitChoices.includes("all");
  const specificUnits = unitChoices.filter((c) => c !== "all");

  function toggleUnit(unitId: string) {
    // Picking a specific unit cancels the "All units" master, since
    // those are mutually exclusive (whole-model vs subset).
    setUnitChoices((curr) => {
      const withoutAll = curr.filter((c) => c !== "all");
      return withoutAll.includes(unitId)
        ? withoutAll.filter((c) => c !== unitId)
        : [...withoutAll, unitId];
    });
  }

  function toggleAll() {
    setUnitChoices((curr) => (curr.includes("all") ? [] : ["all"]));
  }

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
    setAllDay(true);
    setUnitChoices([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bikeId || !dateFrom || !dateTo) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (hasCustomerInfo) {
        // Walk-in booking. Walk-in mode currently supports:
        //   • 0 ticked         → auto-pick a free unit
        //   • 1 ticked         → that specific unit
        //   • All units master → group booking, one row per active unit
        // Multi-select on specific units would be a group booking on a
        // subset — needs API support, not built yet.
        if (specificUnits.length > 1) {
          setError(
            "Walk-in: tick 1 unit or use All units. Multi-unit subset isn't supported for walk-ins yet.",
          );
          setBusy(false);
          return;
        }
        const wantedUnit = isAllUnits
          ? "all"
          : specificUnits.length === 1
            ? specificUnits[0]
            : undefined;
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
        const n = typeof body?.count === "number" ? body.count : 1;
        setInfo(
          n > 1
            ? `Group booking saved — ${n} units locked for this customer.`
            : "Booking saved — it now shows in the dashboard.",
        );
      } else {
        // Service / repair block. Multiple specific units fan out into
        // N POSTs (one block row per unit) so existing API stays
        // unchanged. "All units" master sends a single row with no
        // bike_unit_id (whole-model block).
        if (unitChoices.length === 0) {
          setError("Pick at least one unit (or All units).");
          setBusy(false);
          return;
        }
        const targets = isAllUnits ? [undefined] : specificUnits;
        const payloadBase = {
          bikeId,
          dateFrom,
          dateTo,
          startTime: allDay ? undefined : pickupTime,
          endTime: allDay ? undefined : returnTime,
          reason: reason.trim() || undefined,
        };
        const results = await Promise.all(
          targets.map((unitId) =>
            fetch("/api/admin/blocks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payloadBase, bikeUnitId: unitId }),
            }).then(async (r) => ({
              ok: r.ok,
              body: await r.json().catch(() => ({})),
            })),
          ),
        );
        const failures = results.filter((r) => !r.ok);
        if (failures.length === results.length) {
          // Every request failed → show the first error.
          setError(failures[0].body?.error || "Could not add block");
          setBusy(false);
          return;
        }
        if (failures.length > 0) {
          // Partial success — surface so owner knows.
          setError(
            `${failures.length} of ${results.length} units couldn't be blocked: ${failures[0].body?.error || "conflict"}`,
          );
        } else if (isAllUnits) {
          setInfo("Whole-model block added.");
        } else if (targets.length > 1) {
          setInfo(
            `${targets.length} service blocks added — other units of this model stay bookable.`,
          );
        } else {
          setInfo("Service block added — other units of this model stay bookable.");
        }
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
        <label className="block">
          <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
            Bike model
          </span>
          <select
            value={bikeId}
            onChange={(e) => {
              setBikeId(e.target.value);
              setUnitChoices([]);
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

        <div>
          <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
            Units
          </span>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={isAllUnits}
                onChange={toggleAll}
                className="w-4 h-4 accent-red"
              />
              <span className="text-sm font-semibold text-ink">
                All units
              </span>
              <span className="text-xs text-muted">
                {hasCustomerInfo
                  ? "· group booking on the whole model"
                  : "· whole-model block"}
              </span>
            </label>
            {availableUnits.length > 0 && (
              <div className="pl-6 flex flex-wrap gap-x-5 gap-y-2">
                {availableUnits.map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-2 select-none ${
                      isAllUnits ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!isAllUnits && unitChoices.includes(u.id)}
                      onChange={() => toggleUnit(u.id)}
                      disabled={isAllUnits}
                      className="w-4 h-4 accent-red"
                    />
                    <span className="text-sm font-semibold text-ink">{u.label}</span>
                  </label>
                ))}
              </div>
            )}
            {!hasCustomerInfo && unitChoices.length === 0 && (
              <p className="text-xs text-muted pt-1">
                Tick one or more units, or All units.
              </p>
            )}
            {hasCustomerInfo && unitChoices.length === 0 && (
              <p className="text-xs text-muted pt-1">
                Leave empty to auto-pick a free unit, or tick a specific one.
              </p>
            )}
          </div>
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

        {!hasCustomerInfo && (
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 accent-red"
            />
            <span className="text-xs font-bold tracking-[0.1em] uppercase text-ink/70">
              All day
            </span>
            <span className="text-xs text-muted">
              · uncheck for a time-bounded service block
            </span>
          </label>
        )}

        <div
          className={`grid sm:grid-cols-2 gap-3 transition-opacity ${
            hasCustomerInfo || !allDay ? "opacity-100" : "opacity-50"
          }`}
        >
          <label className="block">
            <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
              {hasCustomerInfo ? "Pickup time" : "Start time"}
            </span>
            <select
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              disabled={!hasCustomerInfo && allDay}
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
              {hasCustomerInfo ? "Return time" : "End time"}
            </span>
            <select
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
              disabled={!hasCustomerInfo && allDay}
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
              ? isAllUnits
                ? "Group walk-in — one booking per active unit."
                : specificUnits.length > 1
                  ? "Walk-in: tick 1 unit or All units (multi-unit not supported)."
                  : specificUnits.length === 1
                    ? "Walk-in booking on this specific unit."
                    : "Walk-in booking — system picks a free unit."
              : isAllUnits
                ? `Whole-model block${allDay ? "" : " (time-bounded)"} — all units unavailable.`
                : specificUnits.length > 1
                  ? `Service block on ${specificUnits.length} units${allDay ? "" : ` from ${pickupTime} to ${returnTime}`}.`
                  : specificUnits.length === 1
                    ? `Service block on this unit${allDay ? "" : ` from ${pickupTime} to ${returnTime}`}.`
                    : "Pick a unit (or All units) to block."}
          </p>
          <button
            type="submit"
            disabled={busy || (!hasCustomerInfo && unitChoices.length === 0)}
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
        Recent entries
      </h2>
      <p className="text-xs text-muted mb-4">
        Service blocks live here. Walk-in bookings are also listed for
        quick access — click one to manage it.
      </p>
      {initialBlocks.length === 0 && initialWalkIns.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <div className="space-y-2">
          {initialBlocks.map((b) => (
            <div
              key={`block-${b.id}`}
              className="flex items-center justify-between bg-amber-50 border border-amber-300 px-4 py-3 gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink truncate flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] tracking-[0.15em] uppercase font-bold px-1.5 py-0.5 bg-amber-300 text-ink">
                    service
                  </span>
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
                  {fmtDate(b.date_from)}
                  {b.start_time && <span> {b.start_time.slice(0, 5)}</span>}
                  {" → "}
                  {fmtDate(b.date_to)}
                  {b.end_time && <span> {b.end_time.slice(0, 5)}</span>}
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
          {groupBookingsForDisplay(initialWalkIns).map((g) => {
            const head = g.bookings[0];
            return (
              <Link
                key={`walkin-${g.key}`}
                href={`/admin/bookings/${g.primaryId}`}
                className="flex items-center justify-between bg-white border border-ink/10 px-4 py-3 gap-4 hover:border-red transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink truncate flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] tracking-[0.15em] uppercase font-bold px-1.5 py-0.5 bg-green-200 text-ink">
                      walk-in
                    </span>
                    <span>{g.customerName}</span>
                    {g.isGroup && (
                      <span className="text-[10px] tracking-[0.15em] uppercase font-bold px-1.5 py-0.5 bg-green-200 text-ink">
                        × {g.bookings.length} bikes
                      </span>
                    )}
                    <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-ink/40">
                      {g.bikeName}
                      {g.unitsSummary && ` · ${g.unitsSummary}`}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {fmtDate(head.date_from)} {head.pickup_time.slice(0, 5)}
                    {" → "}
                    {fmtDate(head.date_to)} {head.return_time.slice(0, 5)}
                  </p>
                </div>
                <span className="text-xs font-bold tracking-widest uppercase text-ink/40">
                  open →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
