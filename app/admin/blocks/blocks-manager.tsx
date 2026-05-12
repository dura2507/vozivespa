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
  // How many bikes of this model the action covers. Quantity-based
  // is the owner's mental model — "I have 4, I'm using 2 for this
  // customer / putting 2 in for service" — they don't care which
  // specific unit gets the row, they're identical bikes. "all" is a
  // special value that maps to a whole-model block (one DB row).
  const [quantity, setQuantity] = useState<number | "all">(1);
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
  const fleetSize = availableUnits.length;
  const isAllUnits = quantity === "all";
  const numericQuantity = quantity === "all" ? fleetSize : quantity;

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
    setQuantity(1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bikeId || !dateFrom || !dateTo) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      // Quantity-based: owner says "I'm using 2 of my 4 Liberty 50 TCs".
      // For the API we map that to either:
      //   • bikeUnitId "all"      (quantity = "all" → whole-model)
      //   • bikeUnitId undefined  (quantity = 1     → backend auto-picks one)
      //   • bikeUnitIds [N first] (quantity = 2..N  → first N units from the
      //                            list; backend validates each is free)
      // Picking from the front of the list is arbitrary but deterministic;
      // the bikes are identical so "which specific ones" doesn't matter.
      const targetIds =
        !isAllUnits && numericQuantity > 1
          ? availableUnits.slice(0, numericQuantity).map((u) => u.id)
          : [];

      if (hasCustomerInfo) {
        const payload: Record<string, unknown> = {
          bikeId,
          dateFrom,
          dateTo,
          pickupTime,
          returnTime,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          customerEmail: customerEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        };
        if (isAllUnits) payload.bikeUnitId = "all";
        else if (targetIds.length > 0) payload.bikeUnitIds = targetIds;
        // else: quantity = 1 → no unit field, backend auto-picks
        const res = await fetch("/api/admin/bookings/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
            ? `Group booking saved — ${n} bikes locked for this customer.`
            : "Booking saved — it now shows in the dashboard.",
        );
      } else {
        // Service / repair block. Same shape: quantity → N POSTs.
        // "All units" sends one whole-model row (bike_unit_id null);
        // other counts fan out into N specific blocks.
        const blockTargets: Array<string | undefined> = isAllUnits
          ? [undefined]
          : numericQuantity === 1
            ? [availableUnits[0]?.id]
            : availableUnits.slice(0, numericQuantity).map((u) => u.id);
        const payloadBase = {
          bikeId,
          dateFrom,
          dateTo,
          startTime: allDay ? undefined : pickupTime,
          endTime: allDay ? undefined : returnTime,
          reason: reason.trim() || undefined,
        };
        const results = await Promise.all(
          blockTargets.map((unitId) =>
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
          setError(failures[0].body?.error || "Could not add block");
          setBusy(false);
          return;
        }
        if (failures.length > 0) {
          setError(
            `${failures.length} of ${results.length} bikes couldn't be blocked: ${failures[0].body?.error || "conflict"}`,
          );
        } else if (isAllUnits) {
          setInfo("Whole-model block added.");
        } else if (blockTargets.length > 1) {
          setInfo(
            `${blockTargets.length} bikes blocked — the rest of the model stays bookable.`,
          );
        } else {
          setInfo("Bike blocked — the rest of the model stays bookable.");
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
              setQuantity(1);
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
            How many bikes?
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: Math.max(fleetSize, 1) }, (_, i) => i + 1).map((n) => {
              const active = quantity === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuantity(n)}
                  className={`min-w-12 px-4 py-2 text-sm font-bold border transition-colors ${
                    active
                      ? "bg-red text-white border-red"
                      : "bg-white text-ink border-ink/15 hover:border-red"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            {fleetSize > 1 && (
              <button
                type="button"
                onClick={() => setQuantity("all")}
                className={`px-4 py-2 text-sm font-bold border transition-colors ${
                  isAllUnits
                    ? "bg-red text-white border-red"
                    : "bg-white text-ink border-ink/15 hover:border-red"
                }`}
              >
                All ({fleetSize})
              </button>
            )}
          </div>
          <p className="text-xs text-muted pt-2">
            {fleetSize === 0
              ? "No active units for this model."
              : hasCustomerInfo
                ? isAllUnits
                  ? `Group booking on all ${fleetSize} bikes.`
                  : numericQuantity === 1
                    ? "Walk-in on one bike (system picks a free one)."
                    : `Group booking on ${numericQuantity} bikes.`
                : isAllUnits
                  ? "Whole-model block — every unit unavailable."
                  : numericQuantity === 1
                    ? "One bike out of service."
                    : `${numericQuantity} bikes out of service — the rest stay bookable.`}
          </p>
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

        <div className="flex items-center justify-end gap-4 pt-2">
          <button
            type="submit"
            disabled={busy || fleetSize === 0}
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
