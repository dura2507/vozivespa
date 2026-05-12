-- bookings.locale: which UI locale the customer was on when they
-- submitted the booking. Used so the confirmation / decided emails
-- go out in the customer's language. Defaults to 'en' for backfill
-- on existing rows.

alter table public.bookings
  add column if not exists locale text not null default 'en'
  check (locale in ('en', 'de', 'es', 'it'));
