-- Owner asked for a hidden backup unit: a physical Liberty 50 that
-- exists in the booking pool (so the calendar can use it when the
-- four visible units are all gone) but never shows up in the public
-- "4 in our fleet" count — Thomas decides spontaneously whether to
-- release the spare for a given customer.
--
-- New column on bike_units. Default false so existing units stay
-- visible. To mark the spare:
--   update bike_units set is_backup = true where id = '...';

alter table public.bike_units
  add column if not exists is_backup boolean not null default false;

create index if not exists bike_units_is_backup_idx
  on public.bike_units (is_backup);
