import { loadAnalytics, countryLabel, type TopRow } from "@/lib/analytics-data";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

// One decimal place when the average is <10, integer otherwise. Keeps
// the card readable on a quiet new tracker (0.4 instead of 0) without
// going crazy with precision once volume picks up.
function formatAverage(n: number): string {
  if (n === 0) return "0";
  if (n < 10) return n.toFixed(1);
  return String(Math.round(n));
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-ink/10 p-4">
      <p className="text-[10px] tracking-[0.2em] uppercase text-ink/50 font-bold">
        {label}
      </p>
      <p className="font-bold text-3xl text-ink mt-1 leading-none tabular-nums">
        {value}
      </p>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  );
}

function TopTable({
  title,
  rows,
  empty,
  formatKey,
}: {
  title: string;
  rows: TopRow[];
  empty: string;
  formatKey?: (key: string) => string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.views), 0);
  return (
    <section className="bg-white border border-ink/10 p-4">
      <h2 className="font-semibold uppercase text-xs tracking-[0.12em] text-ink/80 mb-3">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0 relative">
                <div
                  className="absolute inset-y-0 left-0 bg-red/10"
                  style={{ width: `${(r.views / max) * 100}%` }}
                  aria-hidden
                />
                <span className="relative block truncate text-ink py-1 px-2">
                  {formatKey ? formatKey(r.key) : r.key}
                </span>
              </div>
              <span className="font-bold text-ink shrink-0 tabular-nums">
                {r.views}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminAnalyticsPage() {
  const data = await loadAnalytics();
  const maxDay = data.perDay.reduce((m, d) => Math.max(m, d.views), 0);
  // Stamp the load time on the server so the user knows how fresh
  // the snapshot they're looking at is. Rendered in Zagreb local time
  // since that's the operator's timezone.
  const loadedAt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-4">
        <h1 className="font-bold text-3xl text-ink">
          Visitors
        </h1>
        <p className="text-xs text-muted">
          Self-hosted hit counter . anonymous . no cookies
        </p>
      </div>
      <div className="mb-6">
        <RefreshButton loadedAt={loadedAt} />
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Visitors 7d"
          value={String(data.totalVisitors7d)}
          sub={`${data.totalViews7d} page views`}
        />
        <StatCard
          label="Visitors 30d"
          value={String(data.totalVisitors30d)}
          sub={`${data.totalViews30d} page views`}
        />
        <StatCard
          label="Avg / day (7d)"
          value={formatAverage(data.totalVisitors7d / 7)}
          sub="unique visitors"
        />
        <StatCard
          label="Pages / visit"
          value={
            data.totalVisitors30d > 0
              ? (data.totalViews30d / data.totalVisitors30d).toFixed(1)
              : "0"
          }
          sub="last 30 days"
        />
      </section>

      <section className="bg-white border border-ink/10 p-4 mb-8">
        <h2 className="font-semibold uppercase text-xs tracking-[0.12em] text-ink/80 mb-4">
          Last 30 days
        </h2>
        {maxDay === 0 ? (
          <p className="text-xs text-muted">
            No visits yet. Numbers will populate once the site sees traffic.
          </p>
        ) : (
          <div>
            <div className="flex items-end gap-1 h-32">
              {data.perDay.map((d) => {
                const heightPct = maxDay > 0 ? (d.views / maxDay) * 100 : 0;
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    title={`${d.date}: ${d.views} views, ${d.visitors} visitors`}
                  >
                    <div
                      className="w-full bg-red/70 hover:bg-red transition-colors"
                      style={{ height: `${heightPct}%`, minHeight: d.views > 0 ? "2px" : "0" }}
                    />
                    <span className="invisible group-hover:visible absolute bottom-full mb-1 text-[10px] font-bold text-ink bg-white border border-ink/20 px-1.5 py-0.5 whitespace-nowrap z-10">
                      {d.views} / {d.visitors}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-ink/40 mt-2 font-mono">
              <span>{data.perDay[0]?.date.slice(5)}</span>
              <span>today</span>
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopTable
          title="Top pages (30d)"
          rows={data.topPaths}
          empty="No page views yet."
        />
        <TopTable
          title="Top countries (30d)"
          rows={data.topCountries}
          empty="No country data yet."
          formatKey={(k) => countryLabel(k)}
        />
        <TopTable
          title="Top referrers (30d)"
          rows={data.topReferrers}
          empty="No referrer data yet."
        />
        <TopTable
          title="Top languages (30d)"
          rows={data.topLocales}
          empty="No language data yet."
          formatKey={(k) => k.toUpperCase()}
        />
      </section>
    </div>
  );
}
