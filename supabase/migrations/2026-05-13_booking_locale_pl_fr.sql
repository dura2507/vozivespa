-- Extend bookings.locale check constraint to allow 'pl' (Polish) and
-- 'fr' (French) on top of the existing five locales.

alter table public.bookings
  drop constraint if exists bookings_locale_check;

alter table public.bookings
  add constraint bookings_locale_check
  check (locale in ('en', 'de', 'es', 'it', 'hr', 'pl', 'fr'));
