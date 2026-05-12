-- Time-bounded manual blocks
--
-- Until now manual blocks always covered a whole day. The owner asked
-- for short blocks (e.g. "brake job, 2 hours" or "service drop-off at
-- 10:00, ready by 14:00") so the rest of the day stays bookable.
--
-- Both columns are nullable — null on either side means "whole day" so
-- existing rows keep their behaviour. When both are set, the
-- availability check treats it as a time-bounded service window.

alter table public.blocked_dates
  add column if not exists start_time time,
  add column if not exists end_time time;
