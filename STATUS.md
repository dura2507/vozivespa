# Project status & handoff

Living context for anyone picking up this repo, including Claude Code on another
machine. **Pull `main`, read this first, then CALENDAR_MAP.md.** Keep this file
updated as work progresses and commit + push, so a second machine stays in sync.

Two things to know about how continuity works here:
- Local Claude **memory does NOT travel** across machines. This git-tracked file
  is the handoff channel. If it is not written here, the other machine will not know it.
- **No secrets in this file, ever** (SumUp keys, Telegram bot tokens, chat ids stay
  in Vercel env / local only).

Last updated: 2026-07-13.

## What this project is
`rentamotozadar.com`: a scooter/motorbike rental platform for a shop in Zadar, Croatia.
Stack: Next.js 16 App Router (heavily modified, read `node_modules/next/dist/docs/`
before writing Next code), Supabase (Postgres), Vercel (auto-deploys on push to `main`),
a Telegram bot for owner booking notifications, SumUp for deposit payments. 11 locales
under `app/[lang]`. Owner: Thomas. On-site operator: Priscilla.

## How to ship
- Deploy = `git push origin HEAD:main`. Vercel auto-deploys `main`.
- Commit + push after every change.
- `npx tsc --noEmit` must be clean before pushing.

## Core domain: the capacity model
Each bike model has K physical units (`bike_units`, active and not `is_backup`). A
window is bookable iff at no instant do overlapping bookings exceed K. Customers are
NOT pinned to a specific bike: `bookings.bike_unit_id` may be NULL and still counts as
demand. 30-minute turnaround buffer between rentals. `is_backup` units are the hidden
"Ghost Bike" reserve, excluded from public K. **Full rules, every function, the one
invariant, and a change-checklist are in `CALENDAR_MAP.md`. Read it before touching
anything that computes availability.**

## Done (implemented + verified live, 2026-07-13)
- Telegram single-confirm gate: was `!unitId`, falsely aborted bookable-but-fragmented
  windows; now gates on `conflict`.
- Homepage availability badge (`getAvailableNowCounts`, lib/bike-pricing.ts): counted
  pinned-only, showed "Available now" while a model was fully out via an unpinned
  booking; now counts unpinned demand. Verified live.
- Ghost/backup asymmetry (`findFreeUnit`/`findFreeUnits` + 3 hint fns in lib/availability.ts):
  ghost-parked bookings counted against regular K, so the calendar showed a day free while
  the submit/confirm gate rejected it; now excluded. Verified live (scooter-50 freeUnits
  0 -> 1 where a bike was actually free, stayed 0 where genuinely full).
- Admin edit path (owner extending a booking, e.g. David 24h): confirmed correct.
- Availability pills confirmed synced to real-time state (`returned_at` reflected).
- Half-day calendar cells (morning/afternoon red on the day picker): already existed and work.

## Open backlog (none block the normal customer flow; operator-edge or display only)
- [ ] `undo_return` (app/api/admin/bookings/[id]/fulfillment/route.ts): no capacity
      re-check. Un-returning a booking whose slot was rebooked can briefly over-book.
- [ ] Telegram confirm `includeBackup` asymmetry: single confirm passes `includeBackup:true`,
      group confirm does not (app/api/telegram/webhook/route.ts). A group near capacity may
      reject what a single booking would accept.
- [ ] Payment confirm (app/api/payments/verify + webhook): no capacity re-check (low risk,
      pending already counts as demand) and does NOT persist `telegram_message_refs`, so
      online-paid owner cards go stale on later status edits.
- [ ] Telegram card edit drops the unit label + English translation after a confirm
      (lib/telegram.ts editTelegramMessageForBooking/Group). Cosmetic.
- [ ] TOCTOU: all write paths are check-then-write with no DB lock; two concurrent submits
      for the last unit can both pass. Low probability at this volume.
- [ ] Dead code: `fullyBookedDates` (lib/pricing.ts), `fmtDateTime` (lib/telegram.ts).
- [ ] Group online-payment path 400s (POST /api/bookings/group requires a receipt file,
      no `payOnline` branch). Dormant until online payments are switched on.

## Deferred by owner (do LAST)
- [ ] R2, the 8h minimum interior gap: a free gap that sits between two full-capacity
      periods and is shorter than 8h should show as occupied (nobody rents a few hours at
      day price). Interior gaps only (edge windows exempt), admin/walk-in exempt. Owner
      wants this only after everything else runs reliably for a week. Spec in CALENDAR_MAP.md (R2).

## Working constraints
- Telegram is READ-ONLY for us: never post in Telegram. Read the monitoring group only.
  Bot token + chat ids are in local env, not in this repo.
- Database is READ-ONLY for us: never auto-cancel or modify real bookings. Riderly
  bookings are REAL bookings, never treat them as test data.
- Secrets (SumUp keys, bot tokens) live only in Vercel env / local, never in repo or chat.
- No em-dash or en-dash in user-facing text; use commas, periods, or plain hyphens.
- Assistant working style with the user: direct, verify claims against live data before
  asserting, no filler, flag the weak point first. Stay friendly.

## Key files
- `CALENDAR_MAP.md`: the availability/calendar reference (functions, dependency map,
  invariant, change-checklist, backlog).
- `lib/availability.ts`, `lib/pricing.ts`: core availability + pricing engine.
- `lib/bike-pricing.ts`: `getUnitCounts` (K), `getAvailableNowCounts` (homepage badge).
- `lib/admin-data.ts`: admin dashboard availability.
- `app/api/availability/route.ts` and `app/api/availability/fleet/route.ts`: public availability.
- `app/api/telegram/webhook/route.ts`, `lib/telegram.ts`: owner confirm/decline flow.
