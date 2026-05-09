import { notFound } from "next/navigation";
import Link from "next/link";
import { CATEGORIES } from "@/lib/mockData";
import { getBookingById } from "@/lib/admin-data";
import { BookingActions } from "./booking-actions";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function fmtTimeOfDay(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
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
        <h1 className="font-barlow font-black uppercase text-3xl tracking-tight text-ink">
          {b.customer_name}
        </h1>
        <span className="text-[10px] tracking-[0.2em] uppercase font-bold bg-ink text-white px-2 py-1">
          {b.status}
        </span>
      </div>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 mb-8">
        <div className="bg-white border border-ink/10 p-5 space-y-3 text-sm">
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
          <Field label="Pickup">
            {fmtDate(b.date_from)} · {fmtTimeOfDay(b.pickup_time)}
          </Field>
          <Field label="Return">
            {fmtDate(b.date_to)} · {fmtTimeOfDay(b.return_time)}
          </Field>
          <Field label="Total">
            <span className="font-bold text-red">
              {b.total_price_cents
                ? `${(b.total_price_cents / 100).toFixed(0)}€`
                : "—"}
            </span>
          </Field>
          <Field label="Deposit via">
            {b.payment_method ? PAYMENT_LABEL[b.payment_method] ?? b.payment_method : "—"}
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
