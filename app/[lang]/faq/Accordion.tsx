"use client";

import { useState } from "react";

export default function Accordion({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink/8 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left py-5 flex items-start gap-4 group"
      >
        <span
          className={`mt-0.5 w-5 h-5 flex items-center justify-center shrink-0 transition-all duration-200 ${
            open ? "bg-red text-white" : "border border-ink/20 text-ink/40 group-hover:border-red group-hover:text-red"
          }`}
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        <span className={`font-semibold text-sm transition-colors ${open ? "text-red" : "text-ink group-hover:text-red"}`}>
          {question}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-[32rem] pb-5" : "max-h-0"
        }`}
      >
        <p className="text-muted text-sm leading-relaxed pl-9">{answer}</p>
      </div>
    </div>
  );
}
