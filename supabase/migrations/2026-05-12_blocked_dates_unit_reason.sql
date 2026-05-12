-- Per-unit manual blocks + free-text reason
--
-- Until now a manual block in blocked_dates took out the whole model.
-- That's wrong when only one of four Liberty 50s is in for service:
-- the other three are still fine to rent. With these two new columns
-- the owner can target a single physical unit and jot a note so the
-- dashboard shows *why* a unit is unavailable.
--
-- Backwards-compatible: existing rows have bike_unit_id = null, which
-- continues to mean "block the whole model". New rows from the admin
-- panel always set bike_unit_id.

alter table public.blocked_dates
  add column if not exists bike_unit_id uuid
    references public.bike_units(id) on delete cascade,
  add column if not exists reason text;

create index if not exists blocked_dates_unit_idx
  on public.blocked_dates (bike_unit_id)
  where bike_unit_id is not null;
