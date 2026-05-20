import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const { count: total } = await sb.from("page_views").select("*", { count: "exact", head: true });
console.log("Total rows:", total);

const { data: latest } = await sb
  .from("page_views")
  .select("created_at, path, country, session_hash")
  .order("created_at", { ascending: false })
  .limit(8);
console.log("\nLast 8 entries:");
latest.forEach(r => console.log(`  ${r.created_at}  ${r.path}  [${r.country ?? '-'}]`));

const { data: rows } = await sb
  .from("page_views")
  .select("created_at, session_hash")
  .gte("created_at", new Date(Date.now() - 10*86400000).toISOString());

const byDay = new Map();
for (const r of rows) {
  const d = r.created_at.slice(0,10);
  if (!byDay.has(d)) byDay.set(d, { v: 0, s: new Set() });
  const b = byDay.get(d);
  b.v += 1;
  if (r.session_hash) b.s.add(r.session_hash);
}
console.log("\nPer-day (last 10 days):");
[...byDay.entries()].sort((a,b)=>b[0].localeCompare(a[0])).forEach(([d,b])=>{
  console.log(`  ${d}  ${String(b.v).padStart(4)} views  ${String(b.s.size).padStart(4)} visitors`);
});
