import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/mockData";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";

export const metadata = {
  title: "Terms & Conditions · SickMotos",
  description: "Reservation terms for SickMotos scooter and motorbike rentals in Zadar.",
};

type Section = {
  heading: string;
  intro?: string;
  bullets: string[];
};

const SECTIONS: Section[] = [
  {
    heading: "Reservations",
    bullets: [
      "Always confirm availability with us immediately before making the payment. Availability may change quickly, and a previous confirmation does not guarantee that the scooter or motorbike is still available.",
      "When making a reservation, please provide the pickup and drop-off dates and times.",
      "A booking fee of 20% of the total amount is required to secure your reservation.",
      "Payment methods: PayPal, bank transfer, Revolut, or cash in person (if you are already in Zadar). We don't accept credit cards.",
      "After making the payment, please send us a screenshot of the transaction as proof. Not needed if paid in cash.",
      "If you arrive more than 1 hour late without notice, your reservation will be automatically cancelled and the booking fee is non-refundable.",
      "If a scooter or motorbike becomes unavailable due to an accident or damage caused by another client, we may cancel your reservation and issue a full refund of your booking fee.",
      "Driving a scooter or motorbike requires prior experience. If we notice that you don't have sufficient experience to ride safely, we reserve the right to decline the reservation without refund.",
    ],
  },
  {
    heading: "Deposit & Payment",
    bullets: [
      "Security deposit: 250€ per bike, refunded after drop-off if no damage.",
      "Booking fee: 20% of total. Secures your dates, non-refundable on cancellation.",
      "Payment methods: PayPal (Friends & Family preferred, no fee), bank transfer, Revolut, or cash on arrival.",
      "We don't accept credit cards.",
    ],
  },
  {
    heading: "Pick-up & Return",
    bullets: [
      "Pick-up and drop-off at Velebitska Ulica 2, 23000 Zadar.",
      "Open Mon-Sun, 09:00 to 19:00.",
      "Pick-up and return slots are 30-minute intervals between 09:00 and 19:00.",
      "15-minute grace period at return. Late drop-offs beyond that incur extra fees.",
      "Send the deposit transaction screenshot after paying so we can verify and confirm.",
    ],
  },
  {
    heading: "Insurance & Safety",
    bullets: [
      "Basic insurance is included in every rental and covers theft of the bike and engine damage.",
      "Accidents, scratches, damage and flat tires are the renter's responsibility.",
      "If a third party causes an accident, you must call the police and obtain an official report. The responsible party is liable.",
      "Helmets are always provided.",
      "All bikes are handed over in perfect working condition. We ask renters to inspect the bike, take photos and videos at pickup, and return it in the same condition.",
    ],
  },
  {
    heading: "Damage, repair & breakdown",
    bullets: [
      "The deposit covers initial repair costs. We take the bike to a local mechanic for assessment; the renter pays the full repair cost per the mechanic's invoice (a copy is always provided).",
      "Roadside breakdown service: free up to 20 km. Over 20 km: 50€. Islands: Preko 150€, Dugi Otok 500€.",
      "Lost key: 50€ replacement fee plus any applicable breakdown service depending on location.",
      "In case of engine failure unrelated to renter behaviour, we cover all costs.",
    ],
  },
  {
    heading: "Fuel",
    bullets: [
      "Every bike is handed over with a full tank. Please return it with a full tank as well.",
      "If returned not fully fuelled, we charge the missing fuel plus a refuelling fee.",
    ],
  },
  {
    heading: "Driver requirements",
    bullets: [
      "Bring your valid licence to pickup. No licence, no ride. Owner verifies the licence category matches the bike's class.",
      "Driving requires prior riding experience. If we determine at pickup that experience is insufficient to safely handle the bike, we reserve the right to decline. The booking fee is non-refundable in that case, so please be honest about your experience when booking.",
      "The renter assumes full responsibility for all accidents, damages and injuries during the rental period.",
    ],
  },
];

export default async function TermsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang as Locale);
  return (
    <>
      <Navbar lang={lang as Locale} t={dict.nav} />
      <main className="pt-32 pb-24 md:pb-16 px-5 md:px-12 min-h-screen bg-off-white">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-muted mb-3">
            {dict.terms.eyebrow}
          </p>
          <h1 className="font-barlow font-black uppercase text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.9] tracking-tight text-ink mb-4">
            {dict.terms.title}
          </h1>
          <p className="text-muted text-base leading-relaxed mb-12">
            {dict.terms.intro.replace("{legal}", BRAND.legal)}
          </p>

          <div className="space-y-12">
            {SECTIONS.map((section) => (
              <section key={section.heading}>
                <h2 className="font-barlow font-bold uppercase text-2xl tracking-tight text-ink mb-4">
                  {section.heading}
                </h2>
                {section.intro && (
                  <p className="text-ink text-sm leading-relaxed mb-4">
                    {section.intro}
                  </p>
                )}
                <ul className="space-y-3">
                  {section.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-ink text-sm leading-relaxed"
                    >
                      <span className="text-red font-bold mt-0.5 shrink-0">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-16 pt-8 border-t border-ink/10 text-xs text-muted">
            <p>
              {BRAND.legal} · OIB {BRAND.oib} · {BRAND.address}
            </p>
            <p className="mt-1">
              Questions? Reach us at{" "}
              <a href={`mailto:${BRAND.email}`} className="text-red font-semibold">
                {BRAND.email}
              </a>{" "}
              or via WhatsApp on the contact page.
            </p>
          </div>
        </div>
      </main>
      <Footer lang={lang as Locale} t={dict.footer} nav={dict.nav} />
    </>
  );
}
