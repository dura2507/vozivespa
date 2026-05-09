-- ============================================================================
-- Add pickup_time / return_time to bookings.
--
-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every step is idempotent.
--
-- Defaults (09:00 / 19:00 = full opening day) are applied to existing rows so
-- the not-null constraint can be enforced without data loss.
-- ============================================================================

alter table public.bookings
  add column if not exists pickup_time time not null default '09:00',
  add column if not exists return_time time not null default '19:00';
