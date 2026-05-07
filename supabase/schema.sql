-- ============================================================================
-- SickMotos / Rent a Moto — booking schema
-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Idempotent: safe to re-run; uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- ---------- bikes (mirrors the IDs used in lib/mockData.ts) -------------------
create table if not exists public.bikes (
  id text primary key,
  name text not null,
  model text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  bike_id text not null references public.bikes(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  notes text,
  date_from date not null,
  date_to date not null,
  total_price_cents integer,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  -- random tokens used in the owner email links so we don't expose ids
  confirm_token text not null default encode(gen_random_bytes(24), 'base64'),
  decline_token text not null default encode(gen_random_bytes(24), 'base64'),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decline_reason text,
  constraint bookings_date_order check (date_from <= date_to)
);

create index if not exists bookings_status_bike_idx
  on public.bookings (status, bike_id);

create index if not exists bookings_dates_idx
  on public.bookings (date_from, date_to);

-- ---------- blocked_dates -----------------------------------------------------
create table if not exists public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  bike_id text not null references public.bikes(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  reason text not null default 'manual'
    check (reason in ('booking', 'manual', 'maintenance')),
  booking_id uuid references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_dates_date_order check (date_from <= date_to)
);

create index if not exists blocked_dates_bike_idx
  on public.blocked_dates (bike_id, date_from, date_to);

-- ---------- trigger: when a booking is confirmed, auto-block its dates -------
create or replace function public.sync_blocked_dates_for_booking()
returns trigger
language plpgsql
as $$
begin
  -- transition into confirmed → insert a blocked_dates row if not already there
  if new.status = 'confirmed' and (old is null or old.status <> 'confirmed') then
    insert into public.blocked_dates (bike_id, date_from, date_to, reason, booking_id)
    values (new.bike_id, new.date_from, new.date_to, 'booking', new.id)
    on conflict do nothing;
    new.decided_at := coalesce(new.decided_at, now());
  end if;

  -- transition out of confirmed → remove the block
  if (old is not null and old.status = 'confirmed') and new.status <> 'confirmed' then
    delete from public.blocked_dates
     where booking_id = new.id and reason = 'booking';
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
-- anon key (used in the browser, if at all) gets nothing without explicit policies.

alter table public.bikes         enable row level security;
alter table public.bookings      enable row level security;
alter table public.blocked_dates enable row level security;

-- (intentionally no policies — anon role is denied by default)

-- ---------- seed bikes (matches lib/mockData.ts ids) -------------------------
insert into public.bikes (id, name, model) values
  ('scooter-50',         'Piaggio Liberty 50',         'Piaggio Liberty 50 iGet'),
  ('scooter-50-topcase', 'Piaggio Liberty 50 Topcase', 'Piaggio Liberty 50 iGet — Topcase'),
  ('scooter-125',        'Piaggio Liberty 125',        'Piaggio Liberty 125 iGet'),
  ('bike-125-a',         'Beta RR 125',                'Beta RR 125 LC'),
  ('bike-125-b',         'KTM Duke 125',               'KTM Duke 125'),
  ('bike-390',           'KTM Duke 390',               'KTM Duke 390')
on conflict (id) do update
  set name = excluded.name,
      model = excluded.model;
