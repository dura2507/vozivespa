-- Extend bookings.locale check constraint to allow 'hr' (Croatian).
-- Re-run the alter with the wider check; idempotent in spirit since
-- we drop and recreate the constraint.

alter table public.bookings
  drop constraint if exists bookings_locale_check;

alter table public.bookings
  add constraint bookings_locale_check
  check (locale in ('en', 'de', 'es', 'it', 'hr'));
