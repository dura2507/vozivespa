import Link from "next/link";
import { BRAND } from "@/lib/mockData";

const NAV_LINKS = [
  { label: "Fleet", href: "/#fleet" },
  { label: "Gallery", href: "/gallery" },
  { label: "Info", href: "/info" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-white/60">
      <div className="max-w-5xl mx-auto px-5 md:px-12 py-16 flex flex-col items-center text-center">
        {/* Brand */}
        <Link href="/" className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sickmotos.svg"
            alt="SickMotos"
            className="h-28 sm:h-32 w-auto"
          />
        </Link>
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 mb-6">
          {BRAND.tagline} · Zadar, Croatia
        </p>
        <p className="text-sm leading-relaxed text-white/50 max-w-md mb-10">
          Scooter and bike rental in Zadar - explore the Dalmatian coast on two wheels.
        </p>

        {/* Navigation */}
        <nav className="flex flex-wrap justify-center gap-x-7 gap-y-3 mb-10">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-bold tracking-[0.15em] uppercase text-white/55 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Contacts: Call + WhatsApp for each language */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mb-6">
          {BRAND.contacts.map((contact, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 bg-white/5 border border-white/10 px-4 py-3 text-left"
            >
              <p className="text-[10px] tracking-[0.15em] uppercase font-bold flex items-center gap-1.5">
                <span className="text-base leading-none opacity-100">{contact.languages.join(" ")}</span>
                <span className="text-white/85">{contact.label}</span>
              </p>
              <p className="text-white text-sm font-semibold truncate">{contact.phone}</p>
              <div className="flex gap-2 mt-1">
                <a
                  href={`tel:+${contact.phoneRaw}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 transition-colors text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  Call
                </a>
                <a
                  href={`https://wa.me/${contact.phoneRaw}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1EBD5A] transition-colors text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Instagram + Address */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-3 text-sm mb-8">
          <a
            href={BRAND.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/55 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
            @{BRAND.instagram}
          </a>
          <span className="flex items-center gap-2 text-white/45">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {BRAND.address}
          </span>
        </div>

        {/* Trusted Rental Partner badge */}
        <div className="flex flex-col items-center gap-3 mt-2 mb-2">
          <p className="text-[10px] tracking-[0.25em] uppercase text-white/40 font-bold">
            Trusted Rental Partner
          </p>
          <a
            href="https://riderly.com/rental-locations/croatia/zadar/"
            target="_blank"
            rel="noopener noreferrer"
            title="Trusted Rental Partner"
            className="opacity-80 hover:opacity-100 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.riderly.com/storage/badges/partner-R4.png"
              alt="Riderly"
              className="h-20 w-auto"
            />
          </a>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 w-full text-xs text-white/30 space-y-1">
          <p>{BRAND.legal} · OIB: {BRAND.oib} · Open {BRAND.hours}</p>
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
