-- ============================================================================
-- Add payment_method + deposit_screenshot_path to bookings.
--
-- payment_method:           paypal_ff | paypal_company | bank
-- deposit_screenshot_path:  path inside the `booking-receipts` Storage bucket
--
-- Both are nullable so the live DB can run without immediate code changes,
-- but the API will reject new bookings without them set.
--
-- Run once in Supabase Studio → SQL Editor → New query. Idempotent.
-- ============================================================================

alter table public.bookings
  add column if not exists payment_method text
    check (payment_method in ('paypal_ff','paypal_company','bank')),
  add column if not exists deposit_screenshot_path text;
