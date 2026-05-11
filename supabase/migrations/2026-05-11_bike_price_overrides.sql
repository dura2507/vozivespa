-- ============================================================================
-- bike_price_overrides — owner-editable day prices
--
-- Background: the day-rate strings ("35€") live in lib/mockData.ts. The owner
-- now wants to tweak them without a code deploy. This table stores a per-bike
-- override that the server merges on top of mockData at read time. Only the
-- day price is editable; weekend/week/month tiers stay in code for now.
--
-- bike_id is the same opaque id used in public.bikes (e.g. "scooter-50") so
-- we get FK integrity for free.
-- ============================================================================

create table if not exists public.bike_price_overrides (
  bike_id    text primary key references public.bikes(id) on delete cascade,
  day_price  text not null,
  updated_at timestamptz not null default now()
);

alter table public.bike_price_overrides enable row level security;
-- service_role bypasses RLS — admin API uses the service client.
