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
-- booking_id IS NULL  → manual block (owner reserved the bike for themselves /
--                       maintenance / etc.)
-- booking_id IS NOT NULL → auto-block from a confirmed booking
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

-- ---------- trigger: when a booking is confirmed, auto-block its dates -------
create or replace function public.sync_blocked_dates_for_booking()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' and (old is null or old.status <> 'confirmed') then
    insert into public.blocked_dates (bike_id, date_from, date_to, booking_id)
    values (new.bike_id, new.date_from, new.date_to, new.id);
    new.decided_at := coalesce(new.decided_at, now());
  end if;

  if (old is not null and old.status = 'confirmed') and new.status <> 'confirmed' then
    delete from public.blocked_dates where booking_id = new.id;
    new.decided_at := coalesce(new.decided_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_sync_blocked_dates on public.bookings;
create trigger trg_bookings_sync_blocked_dates
  before update of status on public.bookings
  for each row execute function public.sync_blocked_dates_for_booking();

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
