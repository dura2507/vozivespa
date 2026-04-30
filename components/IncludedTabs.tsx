"use client";

import { useState } from "react";
import Image from "next/image";
import { INCLUDED_INFO, INCLUDED_VESPA, INCLUDED_PICNIC } from "@/lib/mockData";

const TABS = [
  { key: "info", label: "Info", data: INCLUDED_INFO },
  { key: "vespa", label: "Vespa", data: INCLUDED_VESPA },
  { key: "picnic", label: "Picnic", data: INCLUDED_PICNIC },
];

export default function IncludedTabs() {
  const [active, setActive] = useState("info");

  const current = TABS.find((t) => t.key === active)!;

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex justify-center gap-2 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex flex-col items-center gap-2 px-6 py-3 rounded-xl transition-all duration-200 ${
              active === tab.key
                ? "bg-white shadow-md shadow-navy/10 text-navy"
                : "text-navy/50 hover:text-navy"
            }`}
          >
            <TabIcon name={tab.key} active={active === tab.key} />
            <span className="text-xs font-semibold tracking-wide">
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm shadow-navy/8 overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="relative md:w-1/2 h-64 md:h-auto min-h-[280px] overflow-hidden">
            <Image
              src={current.data.image}
              alt={current.data.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          {/* Items */}
          <div className="md:w-1/2 p-8">
            <h3 className="font-dancing text-3xl text-navy mb-6">
              {current.data.title}
            </h3>
            <ul className="space-y-4">
              {current.data.items.map((item) => (
                <li key={item.label} className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-vespa mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <span className="font-playfair font-semibold text-navy text-sm">
                      {item.label}
                    </span>
                    <p className="text-navy/55 text-xs mt-0.5">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const TAB_ICONS: Record<string, string> = {
  info: "https://vozivespa.com/wp-content/uploads/2025/03/information.png",
  vespa: "https://vozivespa.com/wp-content/uploads/2025/03/vespa-2.png",
  picnic: "https://vozivespa.com/wp-content/uploads/2025/03/picnic-basket.png",
};

function TabIcon({ name, active }: { name: string; active: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={TAB_ICONS[name]}
      alt={name}
      className={`w-9 h-9 object-contain transition-all duration-200 ${
        active ? "opacity-100" : "opacity-30"
      }`}
    />
  );
}
