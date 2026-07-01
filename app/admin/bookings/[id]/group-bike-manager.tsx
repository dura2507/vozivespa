"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type GroupBike = {
  id: string;
  bikeName: string;
  unitLabel: string | null;
  ridingStyle: string | null;
  onGhost: boolean;
  canGhost: boolean;
};
type Fleet = { id: string; name: string };

// On-site editor for a booking's bikes: shows what's available for the
// SAME window and lets the owner add or remove a bike with one tap. Every
// add re-checks availability server-side so a unit can't be double-booked.
export default function GroupBikeManager({
  bookingId,
  groupBikes,
  fleet,
  window: w,
}: {
  bookingId: string;
  groupBikes: GroupBike[];
  fleet: Fleet[];
  window: { from: string; to: string; pickupTime: string; returnTime: string };
}) {
  const router = useRouter();
  const [avail, setAvail] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ride, setRide] = useState<Record<string, "solo" | "with_passenger">>({});

  useEffect(() => {
    const qs = new URLSearchParams({
      from: w.from,
      to: w.to,
      pickupTime: w.pickupTime,
      returnTime: w.returnTime,
    });
    let cancelled = false;
    fetch(`/api/availability/fleet?${qs}`)
      .then((r) => r.json())
      .then((d: { bikes?: Array<{ bikeId: string; freeUnits: number }> }) => {
        if (cancelled) return;
        const m: Record<string, number> = {};
        for (const b of d.bikes ?? []) m[b.bikeId] = b.freeUnits;
        setAvail(m);
      })
      .catch(() => !cancelled && setAvail({}));
    return () => {
      cancelled = true;
    };
  }, [w.from, w.to, w.pickupTime, w.returnTime, busy]);

  async function addBike(bikeId: string) {
    setBusy("add:" + bikeId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bikeId, ridingStyle: ride[bikeId] ?? "solo" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add the bike");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function swapGhost(rowId: string, toGhost: boolean) {
    setBusy("ghost:" + rowId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/group`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, toGhost }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not reassign the bike");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function removeBike(rowId: string) {
    if (!confirm("Remove this bike from the booking?")) return;
    setBusy("rm:" + rowId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/group`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not remove the bike");
        return;
      }
      if (data.redirectTo) router.push(`/admin/bookings/${data.redirectTo}`);
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white border border-ink/10 p-5 space-y-4 text-sm">
      <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
        Adjust bikes (on-site)
      </p>

      <div className="space-y-1.5">
        {groupBikes.map((gb) => (
          <div
            key={gb.id}
            className="flex items-center justify-between gap-3 border-b border-ink/5 pb-1.5"
          >
            <span className="min-w-0">
              <span className="font-semibold">{gb.bikeName}</span>
              {gb.unitLabel && (
                <span className="ml-2 font-mono text-xs bg-ink/5 px-2 py-0.5">
                  {gb.unitLabel}
                </span>
              )}
              {gb.onGhost && (
                <span className="ml-2 text-xs font-bold uppercase tracking-widest text-violet-600">
                  Ghost
                </span>
              )}
              <span className="ml-2 text-xs text-muted">
                {gb.ridingStyle === "with_passenger" ? "with passenger" : "solo"}
              </span>
            </span>
            <span className="flex items-center gap-3 shrink-0">
              {gb.canGhost && (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => swapGhost(gb.id, !gb.onGhost)}
                  title={
                    gb.onGhost
                      ? "Move back onto a regular bike"
                      : "Swap onto the hidden Ghost Bike (frees the regular unit)"
                  }
                  className="text-xs font-bold uppercase tracking-widest text-violet-600 disabled:opacity-30 hover:underline"
                >
                  {busy === "ghost:" + gb.id
                    ? "..."
                    : gb.onGhost
                      ? "Regular"
                      : "Ghost Bike"}
                </button>
              )}
              <button
                type="button"
                disabled={busy != null || groupBikes.length <= 1}
                onClick={() => removeBike(gb.id)}
                title={groupBikes.length <= 1 ? "Cancel the booking instead" : undefined}
                className="text-xs font-bold uppercase tracking-widest text-red disabled:opacity-30 hover:underline"
              >
                {busy === "rm:" + gb.id ? "..." : "Remove"}
              </button>
            </span>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-2">
          Add a bike
        </p>
        {avail == null ? (
          <p className="text-xs text-muted">Checking availability...</p>
        ) : (
          <div className="space-y-1.5">
            {fleet.map((f) => {
              const free = avail[f.id] ?? 0;
              return (
                <div key={f.id} className="flex items-center justify-between gap-2">
                  <span className={free > 0 ? "" : "text-muted"}>
                    {f.name}{" "}
                    <span className="text-xs text-muted">
                      · {free > 0 ? `${free} free` : "booked"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <select
                      value={ride[f.id] ?? "solo"}
                      onChange={(e) =>
                        setRide((r) => ({
                          ...r,
                          [f.id]: e.target.value as "solo" | "with_passenger",
                        }))
                      }
                      className="border border-ink/15 text-xs px-1.5 py-1 bg-white"
                    >
                      <option value="solo">solo</option>
                      <option value="with_passenger">+ passenger</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy != null || free <= 0}
                      onClick={() => addBike(f.id)}
                      className="text-xs font-bold uppercase tracking-widest bg-ink text-white px-3 py-1.5 disabled:opacity-30 hover:bg-red transition-colors"
                    >
                      {busy === "add:" + f.id ? "..." : "Add"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red font-medium">{error}</p>}
    </div>
  );
}
