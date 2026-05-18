-- Owner wants to tweak more than the day-rate from the admin panel.
-- Extend bike_price_overrides with the three other tiers so the
-- weekend, week and month rates can be overridden alongside the day
-- rate. Existing rows keep their day_price untouched; new tier
-- columns are nullable so unset means "use the mockData default".

alter table public.bike_price_overrides
  add column if not exists weekend_price text,
  add column if not exists week_price text,
  add column if not exists month_price text;
