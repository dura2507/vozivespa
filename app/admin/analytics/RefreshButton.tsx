"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Manual refresh + "Last updated" stamp for the visitors dashboard.
// Avoids polling on a timer (extra DB load every X seconds even when
// nobody's looking) — the owner just taps the button when they want
// to see the current number.
export function RefreshButton({ loadedAt }: { loadedAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="tabular-nums">Last updated {loadedAt}</span>
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          router.refresh();
          // Visual feedback for ~600ms even if the refresh is faster,
          // so the click feels acknowledged.
          setTimeout(() => setBusy(false), 600);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink/15 hover:border-red hover:text-red transition-colors disabled:opacity-50"
        disabled={busy}
      >
        <svg
          className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        <span className="font-bold tracking-[0.1em] uppercase">
          {busy ? "Refreshing…" : "Refresh"}
        </span>
      </button>
    </div>
  );
}
