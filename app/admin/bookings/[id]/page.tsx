import { notFound } from "next/navigation";
import Link from "next/link";
import { LocaleFlag } from "@/components/Flag";
import { CATEGORIES } from "@/lib/mockData";
import { getBookingById } from "@/lib/admin-data";
import { BookingActions } from "./booking-actions";
import GroupBikeManager from "./group-bike-manager";
import { bookingRef } from "@/lib/booking-ref";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function fmtTimeOfDay(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Zagreb",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAYMENT_LABEL: Record<string, string> = {
  paypal_ff: "PayPal · Friends & Family",
  paypal_company: "PayPal · Company",
  bank: "Bank Transfer (SEPA)",
  revolut: "Revolut",
};

// Language the customer booked in — so Thomas knows which language to
// reply / hand over in.
const LOCALE_NAME: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  it: "Italiano",
  hr: "Hrvatski",
  pl: "Polski",
  fr: "Français",
};

export default async function AdminBookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await getBookingById(id);
  if (!b) notFound();

  const bike = CATEGORIES.find((c) => c.id === b.bike_id);
  const fleet = CATEGORIES.map((c) => ({ id: c.id, name: c.shortName ?? c.model }));
  const ref = bookingRef(b.booking_group_id ?? b.id);
  const phoneDigits = b.customer_phone.replace(/[^\d]/g, "");
  const isImage = b.deposit_screenshot_path?.match(/\.(jpe?g|png|webp|heic|heif)$/i);

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-xs font-bold tracking-[0.15em] uppercase text-muted hover:text-red transition-colors"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-bold text-3xl text-ink">
            {b.customer_name}
          </h1>
          <p className="text-sm text-muted mt-1">
            Booking{" "}
            <span className="font-mono font-bold text-ink tracking-wide">{ref}</span>
          </p>
        </div>
        <span className="text-[10px] tracking-[0.2em] uppercase font-bold bg-ink text-white px-2 py-1">
          {b.status}
        </span>
      </div>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 mb-8">
        <div className="bg-white border border-ink/10 p-5 space-y-3 text-sm">
          {b.groupSize > 1 ? (
            <Field label={`Bikes (${b.groupSize})`}>
              <div className="space-y-1.5">
                {(b.groupBikes ?? []).map((gb) => (
                  <div key={gb.id} className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{gb.bikeName}</span>
                    {gb.unitLabel && (
                      <span className="font-mono text-xs bg-ink/5 px-2 py-0.5">
                        {gb.unitLabel}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {gb.ridingStyle === "with_passenger" ? "with passenger" : "solo"}
                    </span>
                    {gb.priceCents != null && (
                      <span className="text-xs text-muted">
                        · {(gb.priceCents / 100).toFixed(0)}€
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Field>
          ) : (
            <>
              <Field label="Bike">
                <span className="font-semibold">{b.bikeName}</span>{" "}
                <span className="text-muted text-xs">({b.bike_id})</span>
                {bike && (
                  <Link
                    href={`/fleet/${bike.id}`}
                    target="_blank"
                    className="ml-2 text-red text-xs font-bold tracking-widest uppercase"
                  >
                    view →
                  </Link>
                )}
              </Field>
              {b.unitLabel && (
                <Field label="Unit">
                  <span className="font-mono text-sm bg-ink/5 px-2 py-0.5">
                    {b.unitLabel}
                  </span>
                </Field>
              )}
            </>
          )}
          <Field label="Pickup">
            {fmtDate(b.date_from)} · {fmtTimeOfDay(b.pickup_time)}
          </Field>
          <Field label="Return">
            {fmtDate(b.date_to)} · {fmtTimeOfDay(b.return_time)}
          </Field>
          <Field label="Total">
            <span className="font-bold text-red">
              {b.groupTotalCents != null
                ? `${(b.groupTotalCents / 100).toFixed(0)}€`
                : "-"}
            </span>
            {b.groupSize > 1 && (
              <span className="block text-xs text-muted font-normal mt-0.5">
                whole booking · {b.groupSize} bikes
                {b.total_price_cents != null &&
                  ` · this bike ${(b.total_price_cents / 100).toFixed(0)}€`}
              </span>
            )}
          </Field>
          <Field label="Deposit via">
            {b.payment_method ? PAYMENT_LABEL[b.payment_method] ?? b.payment_method : "-"}
          </Field>
          <Field label="Licence">
            {b.drivers_licence ?? "-"}
          </Field>
          <Field label="Riding">
            {b.riding_style === "solo"
              ? "Solo"
              : b.riding_style === "with_passenger"
              ? "With passenger"
              : "-"}
          </Field>
          <Field label="Language">
            <span className="inline-flex items-center gap-2">
              <LocaleFlag locale={b.locale} className="w-5 h-3.5 shrink-0" />
              {LOCALE_NAME[b.locale] ?? b.locale}
            </span>
          </Field>
          <Field label="Email">
            <a href={`mailto:${b.customer_email}`} className="text-red">
              {b.customer_email}
            </a>
          </Field>
          <Field label="Phone">
            {phoneDigits ? (
              <>
                <a href={`tel:${b.customer_phone}`} className="text-ink">
                  {b.customer_phone}
                </a>
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 text-[#25D366] text-xs font-bold tracking-widest uppercase"
                >
                  WhatsApp →
                </a>
              </>
            ) : (
              b.customer_phone
            )}
          </Field>
          {b.notes && (
            <Field label="Notes" multiline>
              <span className="whitespace-pre-wrap">{b.notes}</span>
            </Field>
          )}
          <Field label="Booked">
            <span className="text-muted">{fmtTimestamp(b.created_at)}</span>
          </Field>
          {b.decided_at && (
            <Field label="Decided">
              <span className="text-muted">{fmtTimestamp(b.decided_at)}</span>
            </Field>
          )}
        </div>

        <div className="bg-white border border-ink/10 p-5">
          <p className="text-[10px] tracking-[0.2em] uppercase text-ink/40 font-bold mb-3">
            Deposit receipt
          </p>
          {b.receiptUrl ? (
            isImage ? (
              <a href={b.receiptUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.receiptUrl}
                  alt="Deposit receipt"
                  className="w-full h-auto border border-ink/10"
                />
              </a>
            ) : (
              <a
                href={b.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-sand p-4 text-sm font-semibold text-ink hover:text-red transition-colors"
              >
                Open receipt (PDF) →
              </a>
            )
          ) : (
            <p className="text-sm text-muted">No receipt uploaded.</p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <GroupBikeManager
          bookingId={b.id}
          groupBikes={b.groupBikes ?? []}
          fleet={fleet}
          window={{
            from: b.date_from,
            to: b.date_to,
            pickupTime: fmtTimeOfDay(b.pickup_time),
            returnTime: fmtTimeOfDay(b.return_time),
          }}
        />
      </div>

      <BookingActions booking={JSON.parse(JSON.stringify(b))} />
    </div>
  );
}

function Field({
  label,
  multiline,
  children,
}: {
  label: string;
  multiline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[7rem_1fr] gap-3 ${multiline ? "items-start" : "items-baseline"}`}
    >
      <div className="text-[10px] tracking-[0.15em] uppercase text-ink/40 font-bold">
        {label}
      </div>
      <div className="text-ink">{children}</div>
    </div>
  );
}
