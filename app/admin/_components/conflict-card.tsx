"use client";

import type { ConflictCardData } from "@/lib/availability";

// Mobile-first conflict card for the walk-in / edit forms. Answers, at a
// glance on a phone: WHAT (headline + window), WHY (reason), WHO has each bike
// (list with when it's back), and WHAT TO DO ("would fit if"). Thomas and
// Priscilla work from their phones, so it stacks vertically and never scrolls
// sideways.
export function ConflictCard({ data }: { data: ConflictCardData }) {
  return (
    <div className="border border-red/40 bg-red/5 p-4">
      <p className="font-bold text-red text-base leading-tight">{data.headline}</p>
      <p className="text-ink/50 text-xs font-mono mt-1 break-words">{data.window}</p>
      <p className="text-ink text-sm mt-3 leading-snug">{data.reason}</p>

      {data.out.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold mb-1">
            Out right now
          </p>
          <ul className="divide-y divide-ink/10 border-t border-ink/10">
            {data.out.map((o, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="font-medium text-ink text-sm truncate">{o.name}</span>
                <span className="text-ink/60 text-xs whitespace-nowrap shrink-0">
                  back {o.back}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.suggestion && (
        <p className="mt-3 bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 text-sm font-semibold leading-snug">
          ✓ Would fit if: {data.suggestion}
        </p>
      )}
    </div>
  );
}
