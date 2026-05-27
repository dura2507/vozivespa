-- ============================================================================
-- bike_price_overrides — make day_price nullable, matching the later tiers
--
-- The original migration declared day_price NOT NULL (back when only the
-- day rate was editable). When weekend / week / month columns were added
-- on 2026-05-18 they shipped nullable — null = "use the mockData default".
-- day_price never got the same treatment.
--
-- This bit Thomas today: trying to save only the Duke 390 month price for
-- a bike that didn't have an override row yet → upsert insert with no
-- day_price → NOT NULL violation. Dropping the constraint makes all four
-- tiers behave the same way: omit a tier → it stays at the mockData
-- default.
-- ============================================================================

alter table public.bike_price_overrides
  alter column day_price drop not null;
