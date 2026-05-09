-- ============================================================================
-- SickMotos / Rent a Moto — booking schema
-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ⚠️  Drops the three booking tables if they already exist — fine while we
-- have no real bookings yet. Re-run after schema changes.
-- ============================================================================

drop table if exists public.blocked_dates cascade;
drop table if exists public.bookings      cascade;
drop table if exists public.bikes         cascade;

-- ---------- bikes (mirrors the IDs used in lib/mockData.ts) -------------------
-- Just an ID + active flag. All display data (name, model, image, prices)
-- lives in lib/mockData.ts so we don't double-maintain it.
create table public.bikes (
  id text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  bike_id text not null references public.bikes(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  notes text,
  date_from date not null,
  date_to date not null,
  -- Pickup / return clock-times in the local Zadar window (09:00–19:00, 30-min slots).
  -- Stored separate from date_from/_to so the calendar/blocked_dates logic stays
  -- whole-day and so we can show "Pickup Fri 14:00, Return Sun 18:30" everywhere.
  pickup_time time not null default '09:00',
  return_time time not null default '19:00',
  total_price_cents integer,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  -- random opaque token used in owner email links so booking IDs aren't exposed.
  -- Hex-encoded so it's URL-safe — base64 produces '+' and '/' which break some
  -- URL routers and email clients.
  secret_token text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint bookings_date_order check (date_from <= date_to)
);

create index bookings_status_bike_idx on public.bookings (status, bike_id);
create index bookings_dates_idx       on public.bookings (date_from, date_to);

-- ---------- blocked_dates -----------------------------------------------------
-- Manual owner blocks (maintenance, owner using the bike themselves, etc.).
-- Confirmed customer bookings are NOT mirrored here — the API queries the
-- bookings table directly so it can do time-aware overlap checks against
-- pickup_time / return_time. The booking_id column is kept for forward-
-- compatibility (e.g. if we ever want to express partial-day blocks tied
-- to a booking) but should always be null in current usage.
create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  bike_id text not null references public.bikes(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  booking_id uuid references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_dates_date_order check (date_from <= date_to)
);

create index blocked_dates_bike_idx
  on public.blocked_dates (bike_id, date_from, date_to);

-- The confirm/decide flow used to also bump bookings.decided_at via a
-- trigger; the API now sets it explicitly when flipping status, so no
-- trigger is needed.

-- ---------- RLS: lock everything down to server-only --------------------------
-- service_role bypasses RLS, so the Next.js API routes still have full access.
-- anon role gets nothing without explicit policies.
alter table public.bikes         enable row level security;
alter table public.bookings      enable row level security;
alter table public.blocked_dates enable row level security;

-- ---------- seed bikes (matches lib/mockData.ts ids) -------------------------
insert into public.bikes (id) values
  ('scooter-50'),
  ('scooter-50-topcase'),
  ('scooter-125'),
  ('bike-125-a'),
  ('bike-125-b'),
  ('bike-390')
on conflict (id) do nothing;
