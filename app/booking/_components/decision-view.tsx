import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CATEGORIES, BRAND } from "@/lib/mockData";
import type { BookingRow, BookingStatus } from "@/lib/supabase";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

type Tone = "confirmed" | "declined" | "error";

const COPY: Record<Tone, { tag: string; title: string; sub: string; accent: string }> = {
  confirmed: {
    tag: "Booking confirmed",
    title: "Locked in",
    sub: "The dates are now blocked on the website. Reach out to the customer to set a pickup time.",
    accent: "#25D366",
  },
  declined: {
    tag: "Booking declined",
    title: "Marked as declined",
    sub: "The dates stay open on the website. Drop the customer a note so they know.",
    accent: "#B61F36",
  },
  error: {
    tag: "Heads up",
    title: "Could not process",
    sub: "Open the booking in the dashboard or use the alternative buttons.",
    accent: "#1a1a1a",
  },
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export async function DecisionView({
  tone,
  booking,
  message,
  alreadyDecided,
}: {
  tone: Tone;
  booking?: BookingRow | null;
  message?: string;
  alreadyDecided?: BookingStatus;
}) {
  const copy = COPY[tone];
  const bike = booking
    ? CATEGORIES.find((c) => c.id === booking.bike_id)
    : null;
  const waLink = booking
    ? `https://wa.me/${booking.customer_phone.replace(/[^\d]/g, "")}`
    : null;
  const dict = await getDictionary(DEFAULT_LOCALE);

  return (
    <>
      <Navbar lang={DEFAULT_LOCALE} t={dict.nav} />
      <main className="pt-32 pb-24 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <p
              className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-3"
              style={{ color: copy.accent }}
            >
              {copy.tag}
            </p>
            <h1 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.9] tracking-tight text-ink mb-4">
              {copy.title}
            </h1>
            <p className="text-muted text-base leading-relaxed">
              {message ?? copy.sub}
            </p>
            {alreadyDecided && (
              <p className="text-muted text-sm mt-3 italic">
                This booking was already marked as {alreadyDecided} earlier.
              </p>
            )}
          </div>

          {booking && (
            <div className="bg-ink text-white p-6 mb-8">
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/50 mb-3">
                Booking summary
              </p>
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
                <dt className="text-white/50">Bike</dt>
                <dd className="font-semibold">{bike?.model ?? booking.bike_id}</dd>
                <dt className="text-white/50">Dates</dt>
                <dd className="font-semibold">
                  {fmtDate(booking.date_from)} → {fmtDate(booking.date_to)}
                </dd>
                <dt className="text-white/50">Customer</dt>
                <dd className="font-semibold">{booking.customer_name}</dd>
                <dt className="text-white/50">Email</dt>
                <dd>
                  <a href={`mailto:${booking.customer_email}`} className="text-white">
                    {booking.customer_email}
                  </a>
                </dd>
                <dt className="text-white/50">Phone</dt>
                <dd>
                  {waLink ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#25D366] font-semibold"
                    >
                      {booking.customer_phone}
                    </a>
                  ) : (
                    booking.customer_phone
                  )}
                </dd>
                {booking.notes && (
                  <>
                    <dt className="text-white/50">Notes</dt>
                    <dd className="whitespace-pre-wrap">{booking.notes}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {booking && (
              <a
                href={`https://wa.me/${booking.customer_phone.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#25D366] text-white font-bold text-xs tracking-widest uppercase px-7 py-4 hover:bg-[#1EBD5A] transition-colors"
              >
                Message customer on WhatsApp
              </a>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-2 border border-ink/20 text-ink font-bold text-xs tracking-widest uppercase px-7 py-4 hover:border-red hover:text-red transition-colors"
            >
              Back to {BRAND.name}
            </Link>
          </div>
        </div>
      </main>
      <Footer lang={DEFAULT_LOCALE} t={dict.footer} nav={dict.nav} />
    </>
  );
}
