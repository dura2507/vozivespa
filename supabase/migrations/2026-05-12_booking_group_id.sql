-- Booking groups for walk-in group bookings
--
-- When the owner records a walk-in for "all units" (e.g. a couple
-- rents both Duke 390s), the API inserts N booking rows — one per
-- physical unit, all sharing the same customer info. Without a
-- group identifier they look like N separate bookings in the
-- dashboard, which is visually wrong: one customer, one rental
-- transaction.
--
-- This column ties those rows together so the UI can collapse them
-- into a single entry ("Max · 2× Duke 390") with a units list.
-- Solo walk-ins and all website bookings leave it null.

alter table public.bookings
  add column if not exists booking_group_id uuid;

create index if not exists bookings_group_idx
  on public.bookings (booking_group_id)
  where booking_group_id is not null;
