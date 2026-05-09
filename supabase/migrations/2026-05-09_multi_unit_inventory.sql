-- ============================================================================
-- Multi-unit bike inventory.
--
-- Owner has multiple physical bikes per model (e.g. 4 × Liberty 50). Until
-- now the booking engine treated each `bike_id` as a single unit, so a second
-- customer booking the same dates was rejected even though three more bikes
-- of that model were sitting in the garage.
--
-- New model:
--   bike_units(id, bike_id, label, active)  — one row per physical bike
--   bookings.bike_unit_id                    — which physical bike got booked
--
-- Availability logic moves from "is this bike model busy?" to
-- "is at least one active unit of this model free for the window?".
--
-- Idempotent. Safe to re-run.
-- ============================================================================

create table if not exists public.bike_units (
  id uuid primary key default gen_random_uuid(),
  bike_id text not null references public.bikes(id) on delete cascade,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (bike_id, label)
);

create index if not exists bike_units_bike_idx
  on public.bike_units (bike_id) where active;

-- Seed the physical fleet per HANDOVER #5.
insert into public.bike_units (bike_id, label) values
  ('scooter-125',         'Liberty125-1'),
  ('scooter-50',          'Liberty50-1'),
  ('scooter-50',          'Liberty50-2'),
  ('scooter-50',          'Liberty50-3'),
  ('scooter-50',          'Liberty50-4'),
  ('scooter-50-topcase',  'Liberty50T-1'),
  ('scooter-50-topcase',  'Liberty50T-2'),
  ('scooter-50-topcase',  'Liberty50T-3'),
  ('scooter-50-topcase',  'Liberty50T-4'),
  ('bike-125-a',          'Beta125-1'),
  ('bike-125-b',          'Duke125-1'),
  ('bike-125-b',          'Duke125-2'),
  ('bike-390',            'Duke390-1'),
  ('bike-390',            'Duke390-2')
on conflict (bike_id, label) do nothing;

alter table public.bookings
  add column if not exists bike_unit_id uuid
    references public.bike_units(id) on delete restrict;

create index if not exists bookings_bike_unit_idx
  on public.bookings (bike_unit_id);

-- Backfill: every existing booking gets its bike's first unit. Current
-- live data has no overlapping confirmed bookings on the same model
-- so this is safe.
update public.bookings b
set bike_unit_id = (
  select u.id
  from public.bike_units u
  where u.bike_id = b.bike_id and u.active
  order by u.label
  limit 1
)
where b.bike_unit_id is null;
