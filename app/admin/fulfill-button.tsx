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

  const label = action === "pickup" ? "Mark picked up" : "Mark returned";
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="w-full border-t border-ink/10 px-4 py-3 text-xs font-bold tracking-[0.15em] uppercase text-emerald-700 active:bg-emerald-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {busy ? "…" : label}
    </button>
  );
}
