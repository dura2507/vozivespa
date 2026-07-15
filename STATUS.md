# Project status & handoff

Living context for anyone picking up this repo, including Claude Code on another
machine. **Pull `main`, read this first, then CALENDAR_MAP.md.** Keep this file
updated as work progresses and commit + push, so a second machine stays in sync.

Two things to know about how continuity works here:
- Local Claude **memory does NOT travel** across machines. This git-tracked file
  is the handoff channel. If it is not written here, the other machine will not know it.
- **No secrets in this file, ever** (SumUp keys, Telegram bot tokens, chat ids stay
  in Vercel env / local only).

Last updated: 2026-07-15 (full-system audit + fixes).

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
- 2026-07-15 (Priscilla: "2 liberty out but one is the Vespa"): ghost-parked rentals now
  badged "ghost bike" in every admin list + booking detail; per-unit panel shows the
  reserve as its own tagged row; fleet card splits "out" vs "reserved" (not yet picked
  up); Telegram/owner-email unit label gets a "GHOST BIKE" suffix and survives status
  edits. Counting: service blocks on the ghost unit no longer consume regular capacity
  (engine fns + admin fleet card + public payload); floating blocks never auto-land on
  the ghost; admin PATCH edit keeps a ghost pin instead of silently un-ghosting.
  Full details: CALENDAR_MAP.md open-issues 2b.

## Full-system audit 2026-07-15 (45 agents, adversarially verified)

Fixed this pass (live bugs, the "different inconsistency every day" class):
- Confirm/decline/CANCEL token pages mutated on GET. The cancel link is in every
  customer email, so link-preview bots / mail scanners silently cancelled confirmed
  bookings. Now read-only + click-to-confirm via POST /api/booking/[token]/decision
  (status-guarded, capacity re-check + ghost-preserve on confirm, refuses cancel of a
  picked-up rental, no PII leak to the customer).
- sendOwnerCancellationTelegram: unescaped MarkdownV2 hyphen -> every cancellation
  notification 400'd silently. Escaped.
- Telegram "already <status>" edits could 500 -> Telegram retry-loop. Wrapped in catch.
- Group confirm/decline judged from rows[0] (nondeterministic) and revived cancelled
  rows. Now judges the tapped row, never revives cancelled.
- Admin blocks form listed the Ghost Bike as blockable. Excluded (+ engine: service
  blocks on out-of-pool units no longer consume regular K; done in the prior pass too).
- POST /api/bookings recomputes total_price_cents server-side (was client-trusted;
  drives deposit + card charge). Matches the group route.
- Admin status flip is group-aware (whole group + group card/email) instead of one row.
- Ghost Bike reserve now has its OWN dashboard tile (not folded into any model X/K).

## MUST fix before enabling online payments (PAYMENT_PROVIDER=sumup) - not live yet
These are dormant while payments run in "manual" mode, but are CRITICAL once the SumUp
flag flips. Do not enable online payments until these are done:
- [ ] /api/payments/verify never binds checkoutId/amount to the booking: any PAID
      checkout confirms any pending booking. Bind reference + require amountCaptured >= expected.
- [ ] /api/payments/checkout has no status gate + group deposit sums cancelled siblings.
- [ ] /api/bookings/group has no payOnline branch -> every online group checkout 400s.
- [ ] verify/webhook promote pending->confirmed with no findFreeUnit recheck (race -> two
      confirmed on one unit) and don't persist paid amount/mode; payment_method diverges.
- [ ] bookingRef is only 6 hex chars; checkout_reference not unique per merchant.

## Open backlog (none block the normal customer flow; operator-edge or display only)
- [ ] Timezone: BikeDetail + GroupBooking build "today" from the visitor's browser clock,
      so a visitor behind Zagreb can select a Zagreb-past day (rejected only at submit).
      Use zagrebNow().isoDate for the calendar boundary.
- [ ] GroupBooking: cart qty not re-clamped when availability shrinks after a date change
      (cart contradicts the card; sold-out overlay can lock the stepper); return-time
      dropdown offers an inverted same-day window (server rejects, bad UX).
- [ ] Riderly poller (lib/riderly.ts): marks ALL polled mail \Seen incl. non-allowlisted,
      and marks \Seen BEFORE forward+insert -> can lose a Riderly booking and breaks the
      "email stays unread if Telegram fails" safety net. Also the pending row it inserts is
      not reconciled on Reject (blocks the bike).
- [ ] Admin blocks route: overnight time-bounded block falsely rejected (start>=end without
      dateFrom===dateTo check); per-unit block conflict blind to null-unit + pending bookings;
      multi-unit block POSTs fan out concurrently (TOCTOU on the same unit).
- [ ] Locale whitelist accepts 7 of 11 locales -> hu/sk/cs/pt customers stored as "en" and
      get English emails. Needs a DB check-constraint migration too (bookings_locale_check).
- [ ] Telegram: group/single card edits drop the English translation block; contact/riderly
      code-span values double-escaped (tap-to-copy garbage); already-status paths sync only
      the tapped copy.
- [ ] cleanup-abandoned restore flips ANY id to pending (guard on status='cancelled'); token
      hardcoded in source. poll-riderly auth fail-open when CRON_SECRET unset.
- [x] DONE 2026-07-15: `undo_return` now re-checks capacity before reviving demand.
- [x] DONE 2026-07-15: Telegram group confirm passes `includeBackup:true` (matches single).
- [x] DONE 2026-07-15: payments verify/webhook persist `telegram_message_refs`.
- [ ] TOCTOU: all write paths are check-then-write with no DB lock; two concurrent submits
      for the last unit can both pass. Low probability at this volume.
- [ ] Dead code: `fullyBookedDates` (lib/pricing.ts), `fmtDateTime` (lib/telegram.ts).

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
