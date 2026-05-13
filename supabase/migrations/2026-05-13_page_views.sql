-- In-house visitor tracking. Mirrors what Vercel Analytics does but
-- gives the admin dashboard direct numbers without depending on
-- Vercel API access or plan tier.

create table if not exists public.page_views (
  id bigserial primary key,
  path text not null,
  locale text,
  country text,
  referrer text,
  -- Daily hash of ip+ua+UTC-date so we can count unique visitors per
  -- day without storing any PII. Resets every UTC midnight.
  session_hash text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx
  on public.page_views (created_at desc);

create index if not exists page_views_path_idx
  on public.page_views (path);

create index if not exists page_views_session_idx
  on public.page_views (session_hash);
