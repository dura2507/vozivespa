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

function extractLicenceCountry(notes: string | null): string {
  if (!notes) return "";
  const m = notes.match(/^Licence country:\s*([^\n]+)/);
  return m ? m[1].trim() : "";
}
function stripLicenceCountry(notes: string | null): string {
  if (!notes) return "";
  return notes.replace(/^Licence country:[^\n]*\n*/, "").trim();
}

export function BookingActions({ booking }: { booking: EnrichedBooking }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Decision | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  // Window fields
  const [dateFrom, setDateFrom] = useState(booking.date_from);
  const [dateTo, setDateTo] = useState(booking.date_to);
  const [pickupTime, setPickupTime] = useState(fmtTimeOfDay(booking.pickup_time));
  const [returnTime, setReturnTime] = useState(fmtTimeOfDay(booking.return_time));
  // Customer
  const [customerName, setCustomerName] = useState(booking.customer_name);
  const [customerPhone, setCustomerPhone] = useState(booking.customer_phone);
  const [customerEmail, setCustomerEmail] = useState(booking.customer_email);
  // Details
  const initialPrice = booking.total_price_cents
    ? (booking.total_price_cents / 100).toString()
    : "";
  const [totalPriceEuros, setTotalPriceEuros] = useState(initialPrice);
  const [paymentMethod, setPaymentMethod] = useState(booking.payment_method ?? "");
  const [driversLicence, setDriversLicence] = useState(booking.drivers_licence ?? "");
  const [ridingStyle, setRidingStyle] = useState(booking.riding_style ?? "");
  const [licenceCountry, setLicenceCountry] = useState(
    extractLicenceCountry(booking.notes),
  );
  const [notes, setNotes] = useState(stripLicenceCountry(booking.notes));

  function resetEditState() {
    setEditOpen(false);
    setDateFrom(booking.date_from);
    setDateTo(booking.date_to);
    setPickupTime(fmtTimeOfDay(booking.pickup_time));
    setReturnTime(fmtTimeOfDay(booking.return_time));
    setCustomerName(booking.customer_name);
    setCustomerPhone(booking.customer_phone);
    setCustomerEmail(booking.customer_email);
    setTotalPriceEuros(initialPrice);
    setPaymentMethod(booking.payment_method ?? "");
    setDriversLicence(booking.drivers_licence ?? "");
    setRidingStyle(booking.riding_style ?? "");
    setLicenceCountry(extractLicenceCountry(booking.notes));
    setNotes(stripLicenceCountry(booking.notes));
  }

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
      setError("Pickup/return time must be 09:00-19:00 in 30-minute slots");
      return;
    }
    if (dateFrom > dateTo) {
      setError("Pickup date must be on or before return date");
      return;
    }
    if (customerName.trim().length === 0) {
      setError("Customer name can't be empty.");
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
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          notes: notes.trim(),
          licenceCountry: licenceCountry.trim(),
          totalPriceEuros: totalPriceEuros.trim() === "" ? null : totalPriceEuros.trim(),
          paymentMethod: paymentMethod || null,
          driversLicence: driversLicence || null,
          ridingStyle: ridingStyle || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Update failed");
        if (body?.detail) setError((e) => `${e ?? ""} (${body.detail})`);
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

  const status = booking.status;
  const helpText: Record<string, string> = {
    pending:
      "Confirm books the dates and emails the customer. Decline rejects the request and emails the customer.",
    confirmed:
      "Cancel releases the dates back to the calendar and emails the customer.",
    declined:
      "Re-confirm undoes the decline and locks the dates back in.",
    cancelled:
      "Re-confirm puts this booking back on the calendar.",
  };

  return (
    <div className="bg-white border border-ink/10 p-5 space-y-5">
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink/40 font-bold mb-3">
          Decision
        </p>
        <div className="flex gap-2 flex-wrap">
          {status === "pending" && (
            <>
              <ActionButton
                label="Confirm"
                tone="green"
                onClick={() => decide("confirmed")}
                disabled={busy !== null}
                pending={busy === "confirmed"}
              />
              <ActionButton
                label="Decline"
                tone="ink"
                onClick={() => decide("declined")}
                disabled={busy !== null}
                pending={busy === "declined"}
              />
            </>
          )}
          {status === "confirmed" && (
            <ActionButton
              label="Release dates / Cancel"
              tone="red"
              onClick={() => decide("cancelled")}
              disabled={busy !== null}
              pending={busy === "cancelled"}
            />
          )}
          {(status === "declined" || status === "cancelled") && (
            <ActionButton
              label="Re-confirm"
              tone="green"
              onClick={() => decide("confirmed")}
              disabled={busy !== null}
              pending={busy === "confirmed"}
            />
          )}
        </div>
        <p className="text-xs text-muted mt-2">{helpText[status]}</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] tracking-[0.2em] uppercase text-ink/40 font-bold">
            Edit booking
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
          <div className="space-y-5">
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-2">
                Window
              </p>
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
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
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
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
                  >
                    {SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-2">
                Customer
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Name
                  </span>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
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
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-2">
                Details
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Total price (€)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={totalPriceEuros}
                    onChange={(e) => setTotalPriceEuros(e.target.value)}
                    placeholder="e.g. 70"
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Deposit via
                  </span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">—</option>
                    <option value="paypal_ff">PayPal · Friends & Family</option>
                    <option value="paypal_company">PayPal · Company</option>
                    <option value="revolut">Revolut</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Driver licence
                  </span>
                  <select
                    value={driversLicence}
                    onChange={(e) => setDriversLicence(e.target.value)}
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">—</option>
                    <option value="A">A</option>
                    <option value="A1">A1</option>
                    <option value="A2">A2</option>
                    <option value="AM">AM</option>
                    <option value="B">B</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Licence country
                  </span>
                  <input
                    type="text"
                    value={licenceCountry}
                    onChange={(e) => setLicenceCountry(e.target.value)}
                    placeholder="e.g. Germany"
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Riding style
                  </span>
                  <select
                    value={ridingStyle}
                    onChange={(e) => setRidingStyle(e.target.value)}
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">—</option>
                    <option value="solo">Solo</option>
                    <option value="with_passenger">With passenger</option>
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold">
                    Notes
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full border border-ink/15 px-3 py-2 text-sm"
                  />
                </label>
              </div>
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
                onClick={resetEditState}
                className="border border-ink/20 text-ink font-bold text-xs tracking-widest uppercase px-5 py-2.5 hover:border-red hover:text-red"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-muted">
              Window edits re-run the overlap check so you can&apos;t shift a
              booking into another one&apos;s slot. Everything else updates
              freely — leave fields empty to clear them.
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
