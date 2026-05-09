-- ============================================================================
-- Add drivers_licence + riding_style to bookings.
--
-- drivers_licence: which licence category the customer holds. Owner uses
--                  it at pickup to verify they're entitled to the bike.
-- riding_style:    solo or with_passenger — useful for owner to plan
--                  helmet count and weight checks at pickup.
--
-- Both nullable so legacy bookings don't trip the constraint.
-- The API enforces "required" for new bookings.
-- ============================================================================

alter table public.bookings
  add column if not exists drivers_licence text
    check (drivers_licence in ('A','A1','A2','AM','B')),
  add column if not exists riding_style text
    check (riding_style in ('solo','with_passenger'));
