import { getBusinessAnalytics } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

function eur(cents: number): string {
  return `${(cents / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })}€`;
}

function todayZagreb(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysAgoZagreb(n: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - n * 86_400_000));
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-ink/10 p-4">
      <p className="text-[10px] tracking-[0.2em] uppercase text-ink/50 font-bold">{label}</p>
      <p className="font-bold text-3xl text-ink mt-1 leading-none tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

// Quick-range presets as plain links (no client JS needed).
const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Season (since Apr)", days: null as number | null },
];

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : todayZagreb();
  const from =
    sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : daysAgoZagreb(30);

  const a = await getBusinessAnalytics(from, to);
  const maxRevenue = Math.max(1, ...a.models.map((m) => m.revenueCents));

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 space-y-8">
      <div>
        <h1 className="font-bold text-3xl text-ink">Revenue</h1>
        <p className="text-sm text-muted mt-1">
          Confirmed bookings with pickup between {from} and {to}.
        </p>
      </div>

      {/* Range picker — preset links + a manual from/to form (GET). */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const f = p.days == null ? `${to.slice(0, 4)}-04-01` : daysAgoZagreb(p.days);
            const active = from === f;
            return (
              <a
                key={p.label}
                href={`/admin/revenue?from=${f}&to=${todayZagreb()}`}
                className={`text-xs font-bold tracking-[0.1em] uppercase px-3 py-2 border transition-colors ${
                  active
                    ? "bg-red text-white border-red"
                    : "border-ink/15 text-ink/70 hover:border-red hover:text-red"
                }`}
              >
                {p.label}
              </a>
            );
          })}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="block text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-1">
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="border border-ink/15 px-3 py-2 text-sm bg-white"
            />
          </label>
          <label className="text-xs">
            <span className="block text-[10px] tracking-[0.15em] uppercase text-ink/50 font-bold mb-1">
              To
            </span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="border border-ink/15 px-3 py-2 text-sm bg-white"
            />
          </label>
          <button
            type="submit"
            className="bg-ink text-white text-xs font-bold tracking-[0.1em] uppercase px-4 py-2.5 hover:bg-ink/80 transition-colors"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Headline totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Revenue" value={eur(a.totalRevenueCents)} sub="confirmed bookings" />
        <StatCard label="Bookings" value={String(a.totalBookings)} sub="in this period" />
        <StatCard label="Rental days" value={String(a.totalRentalDays)} sub="billed days total" />
      </div>

      {/* Per-model breakdown */}
      <div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink/40 font-bold mb-3">
          By model
        </p>
        {a.models.length === 0 ? (
          <p className="text-sm text-muted">No confirmed bookings in this period.</p>
        ) : (
          <div className="space-y-2">
            {a.models.map((m) => (
              <div key={m.bikeId} className="bg-white border border-ink/10 p-4">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="font-semibold text-ink">{m.bikeName}</span>
                  <span className="font-bold text-ink tabular-nums">{eur(m.revenueCents)}</span>
                </div>
                <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-red rounded-full"
                    style={{ width: `${(m.revenueCents / maxRevenue) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  {m.bookings}× rented · {m.rentalDays} rental days
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
