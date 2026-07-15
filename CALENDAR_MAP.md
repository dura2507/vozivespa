# Calendar / Availability Function Map

Single reference for the capacity/availability system of rentamotozadar.com.
Re-read this before AND after touching anything that computes availability,
demand, "units free", "busy", "blocked dates", or booking writes. All paths are
repo-relative to the worktree root.

Last updated: 2026-07-13. Keep this file in sync on every availability change
(see the Change checklist at the bottom).

## Domain model in one paragraph

Each bike **model** (e.g. `scooter-50-topcase` = "Liberty 50 TC") has **K
physical units** = rows in `bike_units` that are `active=true AND
is_backup=false`. K is **derived, never stored** (canonical: `getUnitCounts`,
lib/bike-pricing.ts:142). `is_backup=true` units are the hidden "Ghost Bike"
reserve, excluded from public K; only admin escape-hatch paths
(`includeBackup:true`) count them. A rental **window** (`date_from` +
`pickup_time` to `date_to` + `return_time`) is **bookable iff at no instant do
more overlapping bookings exist than K**, with a **30-minute turnaround buffer**
(`TURNAROUND_MINUTES`, lib/pricing.ts) applied after each return before a unit is
reusable, plus optional per-unit service blocks from `blocked_dates`. Critically,
a booking is **NOT pinned to a physical bike**: `bookings.bike_unit_id` may be
**NULL** (unassigned) and the row **still counts as demand**. Demand = `bookings`
rows with `status IN ('confirmed','pending')` and `returned_at IS NULL`
overlapping the window; `blocked_dates` further reduce capacity (NULL
`bike_unit_id` = whole-model block removing all K; set = one unit; NULL times =
whole-day, set = time-bounded).

## The one invariant

> **Every surface that computes availability MUST count ALL overlapping bookings
> for the model, including rows with `bike_unit_id = NULL`, and reject a window
> only when peak concurrent demand > K.** A physical unit id is used ONLY to
> *pin* a genuinely-free unit, never to *size* demand. The reject signal is
> **`conflict !== null`**, never **`unitId === null`** (a bookable window
> legitimately returns `unitId=null, conflict=null` = "capacity proven,
> unpinned"). Any query that filters `bike_unit_id IS NOT NULL` (pinned-only), or
> models occupancy as a per-unit "is this exact unit rented" set, under-counts
> demand and over-books.

## Booking rules (owner spec, 2026-07-13)

The business rules the calendar must obey. Status: [live] already coded, [NEW] not yet built.

- **R1 Turnaround [live].** Keep >= 30 min free between two bookings on a unit so the bike is fresh for the next customer. (`TURNAROUND_MINUTES`.)
- **R2 Minimum interior gap = 8h [NEW].** A free window that sits BETWEEN two full-capacity periods (all K out on both sides) and is shorter than 8h is shown as occupied, and not offered. Reason: nobody rents a few hours at day-price, and it is not worth the owner's handover effort. Edge windows (before the first / after the last full-capacity period of the day) stay bookable at any length. For single-stock models (K=1) this is literally "between two bookings"; for multi-stock it is "between two all-K-out periods". Public display + slot offering only; admin/walk-in is exempt (Thomas can book shorter).
- **R3 Capacity, no fixed assignment [live].** A model with K units is red only when all K are out at that instant. Customers are never pinned to a specific physical bike; each gets one of the K and keeps it for the whole rental. No mid-rental switching. An upgrade/switch is handled by Thomas editing the booking in the admin panel (customer pays the surcharge).
- **R4 Day-cell colour, split at 12:00 [NEW UI].** Red means "all K out, nothing free" for that part of the day.
  - whole day full, or the only free time is a <8h interior gap -> full red
  - morning full (all K out until midday), afternoon has a free unit -> red bottom-left
  - afternoon full, morning has a free unit -> red bottom-right
  - a free unit is available across the day -> green
- **R5 Outside-hours pickup/return [live].** 07:00-08:30 and 19:30-22:00 (+30 euro) stay supported; do not break them.
- **R6 Everything stays in sync [partly live].** Homepage/fleet pills match the real date+time state; multi-booking "available from" suggestions obey R2-R4; admin dashboard agrees with public; Ghost Bike = hidden 5th/backup unit, admin-only, excluded from public capacity, must stay consistent (see open issue #2).

## Core engine (lib/availability.ts, lib/pricing.ts)

| Function | file:line | Computes | Demand counting |
|---|---|---|---|
| `findFreeUnit` | lib/availability.ts:49 | Primary single-booking gate: is window bookable + which unit to pin | all-incl-null OK |
| `findFreeUnits` | lib/availability.ts:334 | Quantity gate: how many of N units fit; pads picked ids with null | all-incl-null OK |
| `findUnitConflict` | lib/availability.ts:242 | Is ONE specific physical unit free (admin/ghost pinning) | pinned-only BY DESIGN; safe only paired with a capacity gate |
| `nextFreeWindow` | lib/availability.ts:517 | Nearest later same-duration window with a free unit (hint) | all-incl-null OK |
| `earliestFreePickupSameDay` | lib/availability.ts:609 | Earliest later same-day pickup slot that frees up (hint) | all-incl-null OK |
| `latestFreeReturnSameDay` | lib/availability.ts:690 | Latest earlier return slot keeping window free (hint) | all-incl-null OK |
| `blockedPickupDates` | lib/availability.ts:811 | **PUBLIC calendar truth**: future dates with no bookable pickup slot | all-incl-null OK |
| `describeConflict` | lib/availability.ts:497 | Formats a `Conflict` to a human string | n/a |
| `getBikeUnitLabel` | lib/availability.ts:767 | Unit id to label ("Liberty50-2") | n/a |
| `unitsFreeForWindow` | lib/pricing.ts:150 | Client capacity primitive: K minus peak demand | all-incl-null OK |
| `isWindowFree` | lib/pricing.ts:191 | >=1 unit free for arbitrary window (outside-hours/trim) | all-incl-null OK |
| `validPickupSlots` / `validReturnSlots` | lib/pricing.ts:210 / :232 | Slots leaving a bookable window | all-incl-null OK |
| `fullyBookedDates` | lib/pricing.ts:252 | Legacy per-unit whole-day coverage | pinned-only, DEAD CODE (`if(!b.unitId)continue`). Delete or fix before reuse |
| `billableDays` / `calculatePrice` | lib/pricing.ts:331 / :383 | Billable 24h units; cheapest applicable tier | n/a |
| Constants `TURNAROUND_MINUTES`, `SHOP_OPEN/CLOSE_HOUR`, `SLOT_MINUTES`, `GRACE_MINUTES`, `LAST_PICKUP_MINUTES` | lib/pricing.ts | Shop hours 09-19, 30-min slots, 30-min turnaround, 18:30 last pickup | n/a |

**Adjacent demand surfaces (part of the engine, other files):**

| Function | file:line | Computes | Demand counting |
|---|---|---|---|
| `getUnitCounts` | lib/bike-pricing.ts:142 | Canonical public **K** per model (active, non-backup) | counts units, not demand OK |
| `getAvailableNowCounts` | lib/bike-pricing.ts:239 | Homepage "Available now / Booked until" badge | all-incl-null OK (**fixed 2026-07-13**; was pinned-only, `if(!b.bike_unit_id)continue`, which lied "Available now" while a model was fully out via an unpinned rental) |
| `listFleetSummary` | lib/admin-data.ts:249 | Admin "X/K fully booked" NOW snapshot | all-incl-null OK (`key = bike_unit_id ?? row:${id}`); no turnaround buffer (intentional, it is a now-snapshot) |
| `listUnitAvailability` | lib/admin-data.ts:437 | Per-unit out/free + next-free for `?bike=` view | all-incl-null OK (distributes NULL rows onto units, applies buffer) |

## Surfaces

### Public booking (single bike)
- **HomePage fleet grid** `app/[lang]/page.tsx:281`: reads-availability. Calls `getAvailableNowCounts`, `getUnitCounts`, `getCategoriesWithPricing`. The green "Available now" badge is only as correct as `getAvailableNowCounts` (fixed 2026-07-13).
- **BikeDetail** `app/[lang]/fleet/[bikeId]/BikeDetail.tsx:80`: reads-availability. Fetches `/api/availability` once; shades calendar via `validPickupSlots`/`validReturnSlots`/`isWindowFree`, paints full-red days verbatim from server `blockedPickupDates`. Keeps NULL-unit rows, strips only backup-unit rows. Agrees with true capacity.
- **GET /api/availability** `app/api/availability/route.ts:20`: computes-capacity. Returns confirmed+pending (returned_at null) bookings, blocks, non-backup unit ids, and authoritative `blockedPickupDates`.

### Multi-booking (group)
- **GroupBooking** `app/[lang]/group/GroupBooking.tsx:71`: reads. Fetches `/api/availability/fleet`; clamps qty to `freeUnits` (stale snapshot only, server is the real gate).
- **GET /api/availability/fleet** `app/api/availability/fleet/route.ts:21`: computes. Per model: `getUnitCounts` + `findFreeUnits` + hint fns. Consumed by group page AND admin GroupBikeManager.
- **POST /api/bookings/group** `app/api/bookings/group/route.ts:93`: writes. Gate `findFreeUnits`. Latent: no `payOnline` branch, requires a receipt File unconditionally (:152-160), so an online group checkout 400s once SumUp is enabled. TOCTOU.
- **Telegram group confirm** `app/api/telegram/webhook/route.ts:81`: writes. Re-checks `findFreeUnits` with `excludeGroupId`; gates on `totalFree < qty`. Omits `includeBackup` (asymmetry vs single confirm).

### Booking API (single write path + confirm)
- **POST /api/bookings** `app/api/bookings/route.ts:95`: writes. Gate `if (availability.conflict)` (:234); persists `bike_unit_id = availability.unitId` (may be NULL). payOnline branch returns early before the Telegram fanout, so online bookings never get `telegram_message_refs` from here. TOCTOU; `totalPriceCents` client-trusted.
- **ConfirmBookingPage** (owner) `app/booking/[token]/confirm/page.tsx:9`: writes. `findFreeUnit(excludeBookingId)`, gate on `conflict`; re-pins unit.
- **Decline/Cancel pages** `app/booking/[token]/decline|cancel`: release-only, no gate needed.

### Admin UI + dashboard
- **AdminDashboard** `app/admin/page.tsx:376`: `force-dynamic`; loads `listAllBookings` + `listFleetSummary` + `listServiceBlocks` (+ `listUnitAvailability` when `?bike=`).
- **FleetCard** `app/admin/page.tsx:264`: shows `listFleetSummary` NOW-snapshot, labeled "fully booked". This is "how many are out **right now**", NOT "any future availability". It legitimately differs from the public per-window calendar; do not try to force them equal.
- **GroupBikeManager** `app/admin/bookings/[id]/group-bike-manager.tsx:19`: the only window-scoped admin surface; delegates free counts to the public `/api/availability/fleet`.
- **FulfillButton** `app/admin/fulfill-button.tsx:9`: sets `returned_at`, frees the unit immediately everywhere.

### Admin APIs (auth-gated)
- **PATCH /api/admin/bookings/[id]** :22: edit window/model. Gate `if (availability.conflict)`, `includeBackup:true`, self-exclude only when model unchanged. (This is the David 24h-edit path.)
- **POST .../[id]/status** :23: confirm/decline/cancel; confirm re-checks `findFreeUnit(includeBackup:true)`. Edits Telegram via `telegram_message_refs`.
- **POST .../[id]/group** :26 add bike / **DELETE** :137 remove / **PATCH (Ghost swap)** :207.
- **POST .../[id]/fulfillment** :16: pickup/return toggles. `undo_return` has NO capacity re-check (see open issues).
- **POST .../bookings/manual** :23: walk-in create; all gates capacity-correct, `includeBackup:true`.

### Payments
- **POST /api/payments/verify** and **/webhook**: promote pending to confirmed (idempotent `.eq('status','pending')`). Both discard the `sendOwner*Telegram` return value, so online-paid bookings get `telegram_message_refs=NULL` (stale owner cards on later status edits). Neither re-checks capacity before confirming.

### Telegram
- **Webhook** `app/api/telegram/webhook/route.ts:34`: confirm/decline. Single confirm uses `findFreeUnit(includeBackup:true)`, gate on `conflict`, re-pins unit. Group confirm uses `findFreeUnits` WITHOUT `includeBackup`.
- **lib/telegram.ts**: send/edit/format helpers. `editTelegramMessageForBooking` (:489) / `editTelegramMessageForGroup` (:474) call `buildText`/`buildGroupText` without `unitLabel`/`translatedNote`, so the unit label + English translation vanish from the card on any status edit.

## Dependency map

Change a core function, re-check every surface listed.

| Core function (file:line) | Surfaces that depend on it |
|---|---|
| `findFreeUnit` av:49 | POST /api/bookings; ConfirmBookingPage; PATCH & status & group & manual (admin); Ghost-swap move-back; Telegram single confirm |
| `findFreeUnits` av:334 | /api/availability/fleet; POST /api/bookings/group; Telegram group confirm; manual all/quantity |
| `findUnitConflict` av:242 (pinned, by design) | Ghost-swap toGhost; manual specific-unit (never used alone as a capacity gate, keep it that way) |
| `blockedPickupDates` av:811 | GET /api/availability, then BikeDetail full-red days (the public calendar) |
| `nextFreeWindow` / `earliest…` / `latest…` av:517/609/690 | /api/availability/fleet hints, then GroupBooking, GroupBikeManager |
| `unitsFreeForWindow` pr:150 (via `isWindowFree`/`validPickup/ReturnSlots`) | BikeDetail calendar shading + slot dropdowns |
| `getUnitCounts` blp:142 (K) | HomePage, BikeDetailPage, GroupBooking, /api/availability/fleet |
| `getAvailableNowCounts` blp:239 | HomePage fleet badge ONLY |
| `listFleetSummary` ad:249 | AdminDashboard FleetCard (now-snapshot) |
| `listUnitAvailability` ad:437 | AdminDashboard `?bike=` panel |
| `telegram_message_refs` | set by POST /api/bookings + group route; NOT set by payments verify/webhook; read by admin status route + telegram webhook sync |

## Change checklist

Run on **every** change that touches availability, demand, booking writes, or unit/block queries:

1. **Does this read/count demand?** It must load `bookings` by `bike_id` with **no `bike_unit_id` filter**, and count **every** overlapping row incl `bike_unit_id=NULL`. If you see `if (!b.bike_unit_id) continue`, a `rentedUnitIds`/pinned Set, or `.not('bike_unit_id','is',null)`, that is the over-book bug (the exact shape that was `getAvailableNowCounts` blp:321 and is still dead `fullyBookedDates` pr:266).
2. **Reject on `conflict`, not `unitId`?** Gates must be `if (availability.conflict)` / `if (free.conflict)` / `if (free.unitIds.length < wanted)`. Never `if (!availability.unitId)`, that falsely rejects bookable-but-fragmented windows.
3. **Status + returned_at filter matches?** Demand = `status IN ('confirmed','pending')` AND `returned_at IS NULL`. Loading only `confirmed`, or forgetting `returned_at`, diverges from every other surface.
4. **Backup handling matches the surface altitude?** Public/K paths exclude `is_backup`; only admin escape-hatch writes pass `includeBackup:true`. Known asymmetry: Telegram single confirm uses `includeBackup:true`, group confirm does not.
5. **Turnaround buffer on bookings both sides?** All capacity fns apply `TURNAROUND_MINUTES` to bookings; blocks use raw span. Deliberate exception: `listFleetSummary` (now-snapshot).
6. **Blocked-dates semantics honored?** NULL `bike_unit_id` = whole-model; set = one unit. NULL times = whole-day; both set = time-bounded. Watch `date_to` inclusivity.
7. **Public vs admin agree in principle?** Public per-window path answers "bookable on a future date"; admin FleetCard answers "out right now" (now-snapshot, no buffer). These legitimately differ, do NOT force them equal. After any change, sanity-check one model where admin shows full-now against the detail-page red days.
8. **Write path?** Every gate is check-then-write with **no DB lock** (TOCTOU). The gate does not guarantee no over-book under concurrency; the backstop is that pending rows count as demand plus the Telegram-confirm re-check.
9. **Touched Telegram send or a payment confirm?** Persist the `sendOwner*Telegram` return `[{chatId,messageId}]` into `telegram_message_refs`, and pass `unitLabel`/`translatedNote` through edit re-renders or they drop from the card.

## Open issues backlog (found 2026-07-13, ranked)

1. **FIXED 2026-07-13**: `getAvailableNowCounts` counted pinned-only, homepage badge showed "Available now" while a model was fully out via an unpinned booking. Now folds in unpinned demand per model.
2. **FIXED 2026-07-13**: Ghost/backup asymmetry (bookings). `findFreeUnit`, `findFreeUnits` and the three hint functions now skip bookings pinned to a unit outside the current pool (backup/ghost when `!includeBackup`, or inactive), so a ghost-parked rental no longer counts against regular K. Verified live on scooter-50: freeUnits 0 -> 1 for the 13.07 afternoon window where 1 regular bike was actually free, and stayed 0 in the genuinely-full morning window (no over-booking).
2b. **FIXED 2026-07-15** (Priscilla: "2 liberty out but one is the Vespa"): the ghost follow-up sweep.
   - LABELING: ghost-parked rentals are now badged "ghost bike" (violet) in every admin list (dashboard sections, walk-ins, booking detail solo + group); the per-unit panel shows the reserve as its own tagged row instead of hiding it; `getBikeUnitLabel` appends "GHOST BIKE" (Telegram/owner email); `editTelegramMessageForBooking` keeps the unit label on status edits. Data path: `listUnitLabelMap` returns `is_backup`, `EnrichedBooking.onGhost`, `BookingDisplay.hasGhost`.
   - COUNTING: per-unit service BLOCKS pinned to out-of-pool units no longer consume regular K (findFreeUnit, findFreeUnits, 3 hint fns, blockedPickupDates, listFleetSummary); /api/availability filters ghost blocks from the payload; admin blocks route never auto-floats a block onto the ghost unit.
   - BEHAVIOR: admin PATCH edit keeps a ghost pin (same model, reserve still free) instead of silently un-ghosting.
   - Fleet card now splits committed into "N out / M reserved" (picked_up_at aware, 24h fallback) so an overdue not-yet-collected pickup stops reading as a bike being gone.
3. **TOCTOU on every write path**: read-then-write with no DB constraint; two concurrent submits for the last unit can both pass. Mitigated by the Telegram-confirm re-check, not eliminated.
4. **`undo_return` has no capacity re-check** (app/api/admin/bookings/[id]/fulfillment/route.ts): can re-introduce demand over K.
5. **Telegram confirm `includeBackup` asymmetry**: single confirm passes it, group confirm does not, so the two Confirm buttons can disagree on the same fleet.
6. **Payment promote paths**: no capacity re-check on pending->confirmed, and they discard the Telegram refs (online-paid cards go stale).
7. **Group online-payment path broken (latent)**: POST /api/bookings/group requires a receipt File unconditionally, GroupBooking submits `payOnline=1` with no receipt, so online group checkout 400s. Dormant while online payments are off.
8. **Telegram edit re-render drops fields**: unit label + English translation vanish from a card on any status edit.
9. **Dead code**: `fullyBookedDates` (lib/pricing.ts:252, pinned-only), `fmtDateTime` (lib/telegram.ts:99).
