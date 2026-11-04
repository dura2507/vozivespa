-- Main-season (June to August) prices, editable by the owner in the admin's
-- "Main season" tab. NULL = no own value: the code default from
-- lib/mockData.ts (Thomas' main-season day prices), else the off-season price.
-- The site reads bike_price_overrides with select("*"), so it keeps working
-- before this migration has run; only saving main-season prices needs it.

alter table public.bike_price_overrides
  add column if not exists peak_day_price text,
  add column if not exists peak_weekend_price text,
  add column if not exists peak_week_price text,
  add column if not exists peak_month_price text;
