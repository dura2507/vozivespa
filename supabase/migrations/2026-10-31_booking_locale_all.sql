-- Allow every site language on bookings.locale: hu, sk, cs and pt were
-- missing, so those customers were stored as 'en' and got English emails
-- (and the English rental agreement). Same list as LOCALES in
-- lib/i18n/config.ts.

alter table public.bookings
  drop constraint if exists bookings_locale_check;

alter table public.bookings
  add constraint bookings_locale_check
  check (locale in ('en', 'de', 'hr', 'it', 'pl', 'fr', 'es', 'hu', 'sk', 'cs', 'pt'));
