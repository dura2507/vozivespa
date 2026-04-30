import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ReviewCarousel from "@/components/ReviewCarousel";
import { CATEGORIES, REVIEWS, GALLERY_IMAGES } from "@/lib/mockData";

const INCLUDED = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    label: "Insurance",
    sub: "Basic coverage",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    label: "No hidden fees",
    sub: "Price as shown",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    label: "Unlimited km",
    sub: "No driving limits",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    label: "Phone holder",
    sub: "Handlebar mount",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    label: "Roadside help",
    sub: "Within Zadar region",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    label: "Helmets",
    sub: "1 or 2, your choice",
  },
];

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Pick your ride",
    text: "Choose between the Vespa 50 or 150. Add a picnic package if you like.",
  },
  {
    n: "02",
    title: "Request your dates",
    text: "Check availability on the calendar and send your request — takes 2 minutes.",
  },
  {
    n: "03",
    title: "We confirm via WhatsApp",
    text: "The owner confirms within minutes. Pick up your Vespa and go.",
  },
];

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* ─── HERO ─── */}
      <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden pt-24 pb-24">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="https://vozivespa.com/wp-content/uploads/2025/06/vespa-150.jpg"
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="https://vozivespa.com/wp-content/uploads/2025/03/vespa-v2.mp4" type="video/mp4" />
        </video>
        {/* Gradient overlays — top + bottom for legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/80" />

        {/* Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 md:px-12">
          <p className="text-white/70 text-[11px] tracking-[0.3em] uppercase mb-5 font-medium">
            Zadar, Croatia
          </p>
          <h1 className="font-barlow font-black uppercase text-white leading-[0.9] text-[clamp(3rem,12vw,9rem)] tracking-tight">
            Ride<br />the Coast
          </h1>
          <p className="text-white/75 text-base md:text-lg mt-6 mb-8 leading-relaxed max-w-md">
            Vespa 50 &amp; 150 rentals in Zadar. Helmets, insurance, unlimited km — all included.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <Link
              href="/bookings"
              className="inline-flex items-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-red-dark transition-colors"
            >
              Check Availability
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <span className="text-white/60 text-sm">From 50€/day</span>
          </div>
        </div>

        {/* Stats — desktop only, right side */}
        <div className="absolute bottom-8 right-8 md:right-12 hidden md:flex gap-12 text-right">
          {[["50+", "5-star reviews"], ["2", "Vespa models"], ["∞", "Km included"]].map(
            ([num, label]) => (
              <div key={label}>
                <p className="font-barlow font-black text-4xl text-white leading-none">{num}</p>
                <p className="text-white/55 text-[11px] tracking-wider uppercase mt-1">{label}</p>
              </div>
            )
          )}
        </div>
      </section>

      <main className="pb-20 md:pb-0">

        {/* ─── RIDES ─── */}
        <section className="px-5 md:px-12 pt-20 pb-16 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">Choose your ride</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,5rem)] leading-none tracking-tight text-ink">
              Our Rides
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-7">
            {CATEGORIES.map((cat) => (
              <Link href="/bookings" key={cat.id} className="group block bg-sand">
                <div className="relative overflow-hidden aspect-[16/10] sm:aspect-[4/5]">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                  {/* Tag — top left */}
                  <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
                    <span className="bg-ink/85 backdrop-blur-sm text-white text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-1.5">
                      {cat.tag}
                    </span>
                  </div>
                  {/* Price badge — top right, prominent */}
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-red text-white px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg">
                    <p className="font-barlow font-black text-xl sm:text-2xl leading-none">
                      {cat.price}
                      <span className="text-xs font-normal opacity-80 ml-0.5">{cat.priceUnit}</span>
                    </p>
                  </div>
                </div>
                <div className="px-5 pt-5 pb-5 sm:px-6 sm:pt-7 sm:pb-7 text-center">
                  <h3 className="font-barlow font-black text-ink text-2xl sm:text-3xl uppercase tracking-wide leading-none mb-3 sm:mb-4">
                    {cat.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed mb-4 sm:mb-6">{cat.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-red font-bold text-[11px] sm:text-xs tracking-[0.2em] uppercase border-b-2 border-red pb-1 group-hover:gap-3 transition-all">
                    Book Now
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── INCLUDED ─── */}
        <section className="bg-sand px-5 md:px-12 py-20">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">Every rental</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink mb-12">
              What&apos;s Included
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
              {INCLUDED.map((item) => (
                <div key={item.label} className="flex flex-col items-center text-center gap-3">
                  <span className="text-ink/70">{item.icon}</span>
                  <p className="font-semibold text-sm text-ink">{item.label}</p>
                  <p className="text-xs text-muted leading-relaxed">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section className="bg-ink px-5 md:px-12 py-20">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/40 mb-2">Simple process</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-white mb-14">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.n} className="flex flex-col items-center text-center">
                  <p className="font-barlow font-black text-[5rem] leading-none text-red/30 mb-2 select-none">
                    {step.n}
                  </p>
                  <h3 className="font-barlow font-bold text-2xl uppercase tracking-tight text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-sm text-white/55 leading-relaxed max-w-xs">{step.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-14 flex justify-center">
              <Link
                href="/bookings"
                className="inline-flex items-center gap-2 bg-red text-white font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-red-dark transition-colors"
              >
                Book a Vespa →
              </Link>
            </div>
          </div>
        </section>

        {/* ─── REVIEWS ─── */}
        <section className="px-5 md:px-12 py-20 max-w-7xl mx-auto text-center">
          <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">
            What riders say
          </p>
          <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink mb-12">
            Reviews
          </h2>
          <ReviewCarousel reviews={REVIEWS} />
        </section>

        {/* ─── GALLERY STRIP ─── */}
        <section className="pb-20">
          <div className="px-5 md:px-12 max-w-7xl mx-auto mb-8 text-center">
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-2">In motion</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2rem,6vw,4rem)] tracking-tight text-ink">
              Gallery
            </h2>
          </div>
          {/* Horizontal scroll strip */}
          <div className="flex gap-3 overflow-x-auto px-5 md:px-12 pb-2 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
            {GALLERY_IMAGES.map((src, i) => (
              <div
                key={i}
                className="relative shrink-0 snap-start overflow-hidden"
                style={{ width: "clamp(240px, 40vw, 380px)", height: "clamp(300px, 50vw, 480px)" }}
              >
                <Image
                  src={src}
                  alt={`Gallery ${i + 1}`}
                  fill
                  className="object-cover hover:scale-105 transition-transform duration-700"
                  sizes="380px"
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Link href="/gallery" className="text-sm text-muted underline underline-offset-4 hover:text-red transition-colors">
              See all photos →
            </Link>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="mx-5 md:mx-12 mb-6 bg-red text-white px-8 md:px-12 py-14 md:py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <p className="text-white/60 text-xs tracking-widest uppercase mb-3">Ready to ride?</p>
            <h2 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] tracking-tight">
              Book Your<br />Vespa Today
            </h2>
          </div>
          <Link
            href="/bookings"
            className="shrink-0 inline-flex items-center gap-2 bg-white text-red font-bold text-sm tracking-widest uppercase px-8 py-4 hover:bg-off-white transition-colors"
          >
            Check Availability →
          </Link>
        </section>

      </main>

      <Footer />
    </>
  );
}
