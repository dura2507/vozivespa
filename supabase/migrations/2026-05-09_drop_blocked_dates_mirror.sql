-- ============================================================================
-- Drop the auto-mirror of confirmed bookings into blocked_dates.
--
-- The booking-overlap check is now time-aware and reads bookings.status =
-- 'confirmed' directly (it has to, because pickup_time / return_time live
-- on bookings, not blocked_dates). The mirror is dead state.
--
-- After this migration, blocked_dates contains ONLY manual owner blocks
-- (booking_id IS NULL). The trigger and helper function are removed; the
-- API explicitly sets bookings.decided_at = now() when flipping status.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

drop trigger if exists trg_bookings_sync_blocked_dates on public.bookings;
drop function if exists public.sync_blocked_dates_for_booking();

delete from public.blocked_dates where booking_id is not null;
