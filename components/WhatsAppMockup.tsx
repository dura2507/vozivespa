import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

type Props = {
  category: string;
  range: DateRange;
  name: string;
  phone: string;
  notes: string;
};

export default function WhatsAppMockup({ category, range, name, phone, notes }: Props) {
  const from = range.from ? format(range.from, "d. MMMM yyyy") : "–";
  const to = range.to ? format(range.to, "d. MMMM yyyy") : "–";

  return (
    <div className="flex justify-center">
      {/* Phone frame */}
      <div className="relative w-72 bg-[#111] rounded-[2.5rem] p-3 shadow-2xl ring-4 ring-black/40">
        {/* Speaker */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 w-14 h-1.5 bg-[#222] rounded-full" />

        {/* Screen */}
        <div className="bg-[#E5DDD5] rounded-[2rem] overflow-hidden">
          {/* WhatsApp header */}
          <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-semibold">SickMotos</p>
              <p className="text-white/70 text-xs">New booking request</p>
            </div>
          </div>

          {/* Chat area */}
          <div className="p-4 space-y-3 min-h-[260px]">
            {/* Timestamp */}
            <p className="text-center text-[10px] text-[#667781] bg-white/60 rounded-full px-3 py-1 w-fit mx-auto">
              Today
            </p>

            {/* Message bubble */}
            <div className="bg-white rounded-xl rounded-tl-sm p-3 shadow-sm max-w-[90%]">
              <p className="text-[11px] leading-relaxed text-[#111]">
                <strong>New booking request</strong>
              </p>
              <div className="mt-2 space-y-1 text-[11px] text-[#333]">
                <p>
                  <strong>Bike:</strong> {category}
                </p>
                <p>
                  {from} – {to}
                </p>
                <p>
                  {name || "—"}
                </p>
                <p>
                  {phone || "—"}
                </p>
                {notes && (
                  <p>
                    &quot;{notes}&quot;
                  </p>
                )}
              </div>

              {/* Action links */}
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 bg-[#25D366]/15 rounded-lg px-2.5 py-2">
                  <span className="text-[10px] font-semibold text-[#25D366]">
                    Confirm — sickmotos.com/confirm/…
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-red-50 rounded-lg px-2.5 py-2">
                  <span className="text-[10px] font-semibold text-red-400">
                    Decline — sickmotos.com/reject/…
                  </span>
                </div>
              </div>

              <p className="text-right text-[9px] text-[#999] mt-2">
                09:41 ✓✓
              </p>
            </div>
          </div>

          {/* Input bar */}
          <div className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[10px] text-[#999]">
              Message…
            </div>
            <div className="w-7 h-7 bg-[#25D366] rounded-full flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Home bar */}
        <div className="mx-auto mt-2 w-20 h-1 bg-[#333] rounded-full" />
      </div>
    </div>
  );
}
