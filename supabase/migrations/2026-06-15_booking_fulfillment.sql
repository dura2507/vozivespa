-- ============================================================================
-- bookings: manual pickup / return confirmation
--
-- Owner wants to confirm by hand when a bike is actually collected and
-- when it comes back, instead of the dashboard moving things purely on
-- the clock. A confirmed booking now stays in "Today's pickups" until
-- picked_up_at is set (or 24h past the scheduled pickup as a forgot-to-
-- click fallback), then in "Today's returns" / "Currently out" until
-- returned_at is set (or 24h past the scheduled return).
-- ============================================================================

alter table public.bookings
  add column if not exists picked_up_at timestamptz,
  add column if not exists returned_at  timestamptz;
