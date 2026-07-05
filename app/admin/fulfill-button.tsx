"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// One-tap pickup/return confirmation right on the dashboard card, so the
// owner doesn't have to open the booking detail for the common action.
// Marks every booking in the group (walk-in groups = multiple bikes).
export function FulfillButton({
  ids,
  action,
}: {
  ids: string[];
  action: "pickup" | "return";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    // Guard the one-tap actions with a confirm. "Mark as returned" sets
    // returned_at, which frees the unit on the public calendar IMMEDIATELY
    // (even before the scheduled return) — an accidental tap here silently
    // released a bike a customer still had, which read as a phantom
    // "overbooking" when the next request came in. A quick prompt stops the
    // mis-tap without slowing down the real action.
    const n = ids.length;
    const subject = n > 1 ? `${n} bikes` : "this bike";
    const msg =
      action === "return"
        ? `Mark ${subject} as RETURNED now? This frees ${
            n > 1 ? "them" : "it"
          } on the calendar immediately, even before the scheduled return time.`
        : `Mark ${subject} as picked up?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/bookings/${id}/fulfillment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }),
        ),
      );
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  const label = action === "pickup" ? "Mark as picked up" : "Mark as returned";
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="shrink-0 w-28 sm:w-32 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold tracking-[0.1em] uppercase leading-tight text-center px-3 disabled:opacity-50 transition-colors flex items-center justify-center"
    >
      {busy ? "…" : label}
    </button>
  );
}
