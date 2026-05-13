-- Extend the bookings.payment_method check constraint to allow
-- 'revolut' alongside the existing PayPal/Bank options.

alter table public.bookings
  drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  add constraint bookings_payment_method_check
  check (
    payment_method is null
    or payment_method in ('paypal_ff', 'paypal_company', 'bank', 'revolut')
  );
