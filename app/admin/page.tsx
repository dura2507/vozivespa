import Link from "next/link";
import {
  bucketBookings,
  listAllBookings,
  listFleetSummary,
  type EnrichedBooking,
  type FleetEntry,
} from "@/lib/admin-data";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function fmtTimeOfDay(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function fmtCountdown(ms: number, nowMs: number): string {
  const diff = ms - nowMs;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  let text: string;
  if (abs < 60 * 60_000) text = `${minutes}m`;
  else if (abs < 24 * 3_600_000) text = `${hours}h`;
  else text = `${days}d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

function statusColor(status: string): string {
  return (
    {
      pending: "bg-yellow-200 text-ink",
      confirmed: "bg-green-200 text-ink",
      declined: "bg-ink/20 text-ink",
      cancelled: "bg-red/20 text-red",
    } as Record<string, string>
  )[status] ?? "bg-ink/20 text-ink";
}

function paymentMethodLabel(id: EnrichedBooking["payment_method"]): string {
  if (!id) return "-";
  return (
    {
      paypal_ff: "PayPal F&F",
      paypal_company: "PayPal Co.",
      bank: "Bank Transfer",
    } as const
  )[id];
}

function totalEur(b: EnrichedBooking): string {
  return b.total_price_cents ? `${(b.total_price_cents / 100).toFixed(0)}€` : "-";
}

function BookingRow({
  booking,
  nowMs,
  highlight,
}: {
  booking: EnrichedBooking;
  nowMs: number;
  highlight?: "return" | "pickup";
}) {
  const subtitle = highlight === "return"
    ? `Returns ${fmtCountdown(booking.returnAt, nowMs)}`
    : highlight === "pickup"
    ? `Picks up ${fmtCountdown(booking.pickupAt, nowMs)}`
    : null;
  return (
    <Link
      href={`/admin/bookings/${booking.id}`}
      className="block bg-white border border-ink/10 px-4 py-3 hover:border-red transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-ink truncate">
            {booking.customer_name}
          </span>
          <span className={`text-[10px] tracking-[0.15em] uppercase font-bold px-1.5 py-0.5 ${statusColor(booking.status)}`}>
            {booking.status}
          </span>
          {booking.deposit_screenshot_path && (
            <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-ink/40">
              receipt
            </span>
          )}
        </div>
        <p className="font-bold text-ink shrink-0">{totalEur(booking)}</p>
      </div>
      <p className="text-xs text-muted truncate">
        {booking.bikeName}
        {booking.unitLabel && (
          <span className="ml-2 text-ink/60 font-mono">[{booking.unitLabel}]</span>
        )}
      </p>
      <div className="text-xs text-ink mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span>
          {fmtDate(booking.date_from)} {fmtTimeOfDay(booking.pickup_time)}
        </span>
        <span className="text-muted">→</span>
        <span>
          {fmtDate(booking.date_to)} {fmtTimeOfDay(booking.return_time)}
        </span>
        {subtitle && (
          <span className="text-red font-bold">· {subtitle}</span>
        )}
      </div>
      {booking.payment_method && (
        <p className="text-[10px] tracking-[0.1em] uppercase text-ink/40 mt-1">
          {paymentMethodLabel(booking.payment_method)}
        </p>
      )}
    </Link>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="font-barlow font-black uppercase text-xl tracking-tight text-ink">
          {title}
        </h2>
        <span className="text-xs tracking-[0.15em] uppercase text-ink/40 font-bold">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function FleetCard({ entry }: { entry: FleetEntry }) {
  const fullyOut = entry.totalUnits > 0 && entry.outUnits >= entry.totalUnits;
  return (
    <Link
      href={`/admin?bike=${entry.bikeId}`}
      className={`block p-4 border transition-colors ${
        fullyOut
          ? "bg-red/10 border-red"
          : entry.outUnits > 0
          ? "bg-yellow-50 border-yellow-300"
          : "bg-white border-ink/10"
      } hover:border-red`}
    >
      <p className="text-xs font-bold text-ink truncate">{entry.bikeName}</p>
      <p className="font-barlow font-black text-2xl text-ink mt-1 leading-none">
        {entry.outUnits}
        <span className="text-ink/40 text-base"> / {entry.totalUnits}</span>
      </p>
      <p className="text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mt-1">
        out
      </p>
      {(entry.pendingCount > 0 || entry.upcomingCount > 0) && (
        <p className="text-xs text-muted mt-2 leading-tight">
          {entry.pendingCount > 0 && (
            <span className="text-red font-bold">{entry.pendingCount} pending</span>
          )}
          {entry.pendingCount > 0 && entry.upcomingCount > 0 && " · "}
          {entry.upcomingCount > 0 && <span>{entry.upcomingCount} upcoming</span>}
        </p>
      )}
    </Link>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ bike?: string }>;
}) {
  const { bike: bikeFilter } = await searchParams;
  const nowMs = Date.now();
  const [allRaw, fleet] = await Promise.all([
    listAllBookings(),
    listFleetSummary(nowMs),
  ]);
  const all = bikeFilter ? allRaw.filter((b) => b.bike_id === bikeFilter) : allRaw;
  const buckets = bucketBookings(all, nowMs);
  const filteredEntry = bikeFilter ? fleet.find((f) => f.bikeId === bikeFilter) : null;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-4">
        <h1 className="font-barlow font-black uppercase text-3xl tracking-tight text-ink">
          {filteredEntry ? filteredEntry.bikeName : "Dashboard"}
        </h1>
        <p className="text-xs text-muted">
          {all.length} {bikeFilter ? "filtered" : "total"} bookings ·{" "}
          <span className="text-red font-bold">{buckets.pending.length} pending</span>
          {bikeFilter && (
            <>
              {" · "}
              <Link href="/admin" className="text-red font-bold uppercase tracking-widest">
                clear filter
              </Link>
            </>
          )}
        </p>
      </div>

      {!bikeFilter && (
        <section className="mb-10">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-barlow font-black uppercase text-xl tracking-tight text-ink">
              Fleet status
            </h2>
            <span className="text-xs tracking-[0.15em] uppercase text-ink/40 font-bold">
              {fleet.length} models
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {fleet.map((entry) => (
              <FleetCard key={entry.bikeId} entry={entry} />
            ))}
          </div>
        </section>
      )}

      <Section
        title="Currently out"
        count={buckets.out.length}
        empty="No bikes are currently with a customer."
      >
        {buckets.out.map((b) => (
          <BookingRow key={b.id} booking={b} nowMs={nowMs} highlight="return" />
        ))}
      </Section>

      <Section
        title="Pending — needs decision"
        count={buckets.pending.length}
        empty="No pending requests."
      >
        {buckets.pending.map((b) => (
          <BookingRow key={b.id} booking={b} nowMs={nowMs} highlight="pickup" />
        ))}
      </Section>

      <Section
        title="Upcoming confirmed"
        count={buckets.upcoming.length}
        empty="No upcoming pickups."
      >
        {buckets.upcoming.map((b) => (
          <BookingRow key={b.id} booking={b} nowMs={nowMs} highlight="pickup" />
        ))}
      </Section>

      <Section
        title="Past + closed"
        count={buckets.past.length}
        empty="Nothing yet."
      >
        {buckets.past.slice(0, 25).map((b) => (
          <BookingRow key={b.id} booking={b} nowMs={nowMs} />
        ))}
      </Section>
    </div>
  );
}
