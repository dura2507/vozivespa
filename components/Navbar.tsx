"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { label: "Bookings", href: "/bookings" },
  { label: "Gallery", href: "/gallery" },
  { label: "Info", href: "/info" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const isHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = isHome && !scrolled && !open;
  const textColor = transparent ? "text-white" : "text-ink";
  const hoverColor = transparent ? "hover:text-white/70" : "hover:text-red";

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          transparent
            ? "bg-black/35 backdrop-blur-sm"
            : "bg-off-white/97 backdrop-blur-md border-b border-ink/8"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between" style={{ height: "6.5rem" }}>
          {/* Logo */}
          <Link href="/" className="flex items-center gap-0.5 md:gap-1 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sickmotos.svg"
              alt="SickMotos"
              className={`h-16 sm:h-20 md:h-24 w-auto transition-all ${
                transparent ? "" : "invert"
              }`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rentamoto.svg"
              alt="Rent a Moto"
              className="h-6 sm:h-7 md:h-9 w-auto"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-xs font-bold tracking-[0.1em] uppercase transition-colors ${textColor} ${hoverColor} ${
                  pathname === l.href ? "opacity-100" : "opacity-80"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/bookings"
              className="ml-2 bg-red text-white text-xs font-bold tracking-[0.15em] uppercase px-6 py-3 hover:bg-red-dark transition-colors"
            >
              Book Now
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className={`md:hidden w-9 h-9 flex flex-col items-center justify-center gap-[5px] ${textColor}`}
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            <span className={`block w-5 h-[1.5px] bg-current transition-all duration-200 origin-center ${open ? "rotate-45 translate-y-[6.5px]" : ""}`} />
            <span className={`block w-5 h-[1.5px] bg-current transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-[1.5px] bg-current transition-all duration-200 origin-center ${open ? "-rotate-45 -translate-y-[6.5px]" : ""}`} />
          </button>
        </div>

        {/* Mobile dropdown */}
        <div
          className={`md:hidden bg-off-white border-t border-ink/8 overflow-hidden transition-all duration-300 ${
            open ? "max-h-[32rem] pb-6" : "max-h-0"
          }`}
        >
          <nav className="flex flex-col px-5 pt-3">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="py-3 text-sm font-semibold text-ink border-b border-ink/8 tracking-wide"
            >
              Home
            </Link>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm font-semibold text-ink border-b border-ink/8 tracking-wide hover:text-red transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/bookings"
              onClick={() => setOpen(false)}
              className="mt-4 bg-red text-white text-center text-sm font-bold tracking-widest uppercase py-3"
            >
              Book Now
            </Link>
          </nav>
        </div>
      </header>

      {/* Mobile sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-ink text-white flex items-center justify-between px-5 py-3 border-t border-white/10">
        <div>
          <p className="text-[10px] text-white/50 uppercase tracking-wider">Bike rental Zadar</p>
          <p className="text-sm font-bold">From 39€ / day</p>
        </div>
        <Link
          href="/bookings"
          className="bg-red text-white text-xs font-bold tracking-widest uppercase px-6 py-3"
        >
          Book Now →
        </Link>
      </div>
    </>
  );
}
