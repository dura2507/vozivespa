import { getServiceClient } from "@/lib/supabase";

export type DailyBucket = {
  date: string; // YYYY-MM-DD (UTC)
  views: number;
  visitors: number;
};

export type TopRow = { key: string; views: number };

export type AnalyticsSnapshot = {
  totalViews7d: number;
  totalVisitors7d: number;
  totalViews30d: number;
  totalVisitors30d: number;
  perDay: DailyBucket[]; // last 30 days, oldest first
  topPaths: TopRow[];
  topCountries: TopRow[];
  topReferrers: TopRow[];
  topLocales: TopRow[];
};

type Row = {
  path: string;
  locale: string | null;
  country: string | null;
  referrer: string | null;
  session_hash: string | null;
  created_at: string;
};

const COUNTRY_FLAGS: Record<string, string> = {
  DE: "🇩🇪", AT: "🇦🇹", CH: "🇨🇭", IT: "🇮🇹", ES: "🇪🇸",
  HR: "🇭🇷", FR: "🇫🇷", PL: "🇵🇱", GB: "🇬🇧", US: "🇺🇸",
  NL: "🇳🇱", BE: "🇧🇪", LU: "🇱🇺", SI: "🇸🇮", BA: "🇧🇦",
  RS: "🇷🇸", ME: "🇲🇪", MK: "🇲🇰", CZ: "🇨🇿", SK: "🇸🇰",
  HU: "🇭🇺", PT: "🇵🇹", IE: "🇮🇪", DK: "🇩🇰", SE: "🇸🇪",
  NO: "🇳🇴", FI: "🇫🇮",
};

export function countryLabel(code: string | null): string {
  if (!code) return "Unknown";
  const flag = COUNTRY_FLAGS[code.toUpperCase()];
  return flag ? `${flag} ${code.toUpperCase()}` : code.toUpperCase();
}

// Strip query strings + collapse very long paths so the table stays
// readable. "/" stays as "/".
function normalisePath(p: string): string {
  const noQuery = p.split("?")[0];
  return noQuery.length > 60 ? `${noQuery.slice(0, 60)}…` : noQuery;
}

// Our own hostnames — anything coming from these counts as internal
// navigation, not a referrer. Catches existing rows in the DB that
// were logged before the client tracker filtered same-origin
// referrers out.
const INTERNAL_HOSTS = new Set(
  [
    "rentamotozadar.com",
    "www.rentamotozadar.com",
    "vozivespa.vercel.app",
    "vozivespa.com",
    "www.vozivespa.com",
    ...(process.env.SITE_HOSTNAMES?.split(",").map((h) => h.trim().toLowerCase()) ??
      []),
  ].filter(Boolean),
);

// Pull the host out of a referrer URL. Falls back to the raw string
// when it's not a URL. "" / "/" / our own hosts collapse to "direct".
function normaliseReferrer(r: string | null): string {
  if (!r || r === "" || r === "/") return "(direct)";
  try {
    const u = new URL(r);
    const host = u.hostname.toLowerCase();
    if (INTERNAL_HOSTS.has(host)) return "(direct)";
    return host;
  } catch {
    return r.slice(0, 60);
  }
}

function topN(
  rows: Row[],
  pick: (r: Row) => string | null | undefined,
  n: number,
): TopRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = pick(r);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, views]) => ({ key, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, n);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function loadAnalytics(): Promise<AnalyticsSnapshot> {
  const supabase = getServiceClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("page_views")
    .select("path, locale, country, referrer, session_hash, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[analytics] load error", error);
    return {
      totalViews7d: 0,
      totalVisitors7d: 0,
      totalViews30d: 0,
      totalVisitors30d: 0,
      perDay: [],
      topPaths: [],
      topCountries: [],
      topReferrers: [],
      topLocales: [],
    };
  }
  const rows = (data ?? []) as Row[];

  const now = Date.now();
  const sevenDayCutoff = now - 7 * 86_400_000;

  // Build the 30-day axis up-front so days with zero views still
  // appear on the chart instead of just being missing.
  const perDayMap = new Map<string, { views: number; visitors: Set<string> }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    perDayMap.set(key, { views: 0, visitors: new Set() });
  }

  const visitors7d = new Set<string>();
  const visitors30d = new Set<string>();
  let views7d = 0;

  for (const r of rows) {
    const day = dayKey(r.created_at);
    const bucket = perDayMap.get(day);
    if (bucket) {
      bucket.views += 1;
      if (r.session_hash) bucket.visitors.add(r.session_hash);
    }
    if (r.session_hash) visitors30d.add(r.session_hash);
    if (new Date(r.created_at).getTime() >= sevenDayCutoff) {
      views7d += 1;
      if (r.session_hash) visitors7d.add(r.session_hash);
    }
  }

  const perDay: DailyBucket[] = Array.from(perDayMap.entries()).map(
    ([date, b]) => ({ date, views: b.views, visitors: b.visitors.size }),
  );

  return {
    totalViews7d: views7d,
    totalVisitors7d: visitors7d.size,
    totalViews30d: rows.length,
    totalVisitors30d: visitors30d.size,
    perDay,
    topPaths: topN(rows, (r) => normalisePath(r.path), 10),
    topCountries: topN(rows, (r) => r.country, 10),
    topReferrers: topN(rows, (r) => normaliseReferrer(r.referrer), 10),
    topLocales: topN(rows, (r) => r.locale, 10),
  };
}
