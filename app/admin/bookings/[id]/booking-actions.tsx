"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedBooking } from "@/lib/admin-data";
import { buildSlots, isValidSlot } from "@/lib/pricing";

type Decision = "confirmed" | "declined" | "cancelled";

const SLOTS = buildSlots();

function fmtTimeOfDay(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export function BookingActions({ booking }: { booking: EnrichedBooking }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Decision | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(booking.date_from);
  const [dateTo, setDateTo] = useState(booking.date_to);
  const [pickupTime, setPickupTime] = useState(fmtTimeOfDay(booking.pickup_time));
  const [returnTime, setReturnTime] = useState(fmtTimeOfDay(booking.return_time));

  async function decide(status: Decision) {
    if (!confirm(`Set this booking to "${status}"?`)) return;
    setError(null);
    setInfo(null);
    setBusy(status);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Update failed");
        if (body?.detail) setError((e) => `${e ?? ""} (${body.detail})`);
        setBusy(null);
        return;
      }
      setInfo(`Status set to ${status}.`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!isValidSlot(pickupTime) || !isValidSlot(returnTime)) {
      setError("Pickup/return time must be 09:00–19:00 in 30-minute slots");
      return;
    }
    if (dateFrom > dateTo) {
      setError("Pickup date must be on or before return date");
      return;
    }
    setError(null);
    setInfo(null);
    setBusy("edit");
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          pickupTime,
          returnTime,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Update failed");
        setBusy(null);
        return;
      }
      setInfo("Booking updated.");
      setEditOpen(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white border border-ink/10 p-5 space-y-5">
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink/40 font-bold mb-3">
          Decision
        </p>
        <div className="flex gap-2 flex-wrap">
          <ActionButton
            label="Confirm"
            tone="green"
            onClick={() => decide("confirmed")}
            disabled={busy !== null || booking.status === "confirmed"}
            pending={busy === "confirmed"}
          />
          <ActionButton
            label="Decline"
            tone="ink"
            onClick={() => decide("declined")}
            disabled={busy !== null || booking.status === "declined"}
            pending={busy === "declined"}
          />
          <ActionButton
            label="Cancel"
            tone="red"
            onClick={() => decide("cancelled")}
            disabled={busy !== null || booking.status === "cancelled"}
            pending={busy === "cancelled"}
          />
        </div>
        <p className="text-xs text-muted mt-2">
          Confirm + decline notify the customer by email. Cancel just flips the
          status and frees the dates.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] tracking-[0.2em] uppercase text-ink/40 font-bold">
            Edit dates / times
          </p>
          {!editOpen && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="text-xs font-bold tracking-widest uppercase text-red hover:text-red-dark"
            >
              Edit →
            </button>
          )}
        </div>
        {editOpen && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  Pickup date
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  Pickup time
                </span>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
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
                  Return date
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                  Return time
                </span>
                <select
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy === "edit"}
                className="bg-red text-white font-bold text-xs tracking-widest uppercase px-5 py-2.5 hover:bg-red-dark disabled:opacity-50"
              >
                {busy === "edit" ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setDateFrom(booking.date_from);
                  setDateTo(booking.date_to);
                  setPickupTime(fmtTimeOfDay(booking.pickup_time));
                  setReturnTime(fmtTimeOfDay(booking.return_time));
                }}
                className="border border-ink/20 text-ink font-bold text-xs tracking-widest uppercase px-5 py-2.5 hover:border-red hover:text-red"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-muted">
              Edits run the same overlap check as new bookings — you&apos;ll see
              an error if the new times collide with another booking on the
              same bike.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 px-4 py-3 text-sm text-red font-semibold">
          {error}
        </div>
      )}
      {info && (
        <div className="bg-green-100 border border-green-300 px-4 py-3 text-sm text-ink font-semibold">
          {info}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  tone,
  onClick,
  disabled,
  pending,
}: {
  label: string;
  tone: "green" | "red" | "ink";
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const colors =
    tone === "green"
      ? "bg-[#25D366] hover:bg-[#1EBD5A] text-white"
      : tone === "red"
      ? "bg-red hover:bg-red-dark text-white"
      : "bg-ink hover:bg-ink/80 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${colors} font-bold text-xs tracking-widest uppercase px-5 py-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
    >
      {pending ? "…" : label}
    </button>
  );
}
