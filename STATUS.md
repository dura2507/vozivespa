# Project status & handoff

Living context for anyone picking up this repo, including Claude Code on another
machine. **Pull `main`, read this first, then CALENDAR_MAP.md.** Keep this file
updated as work progresses and commit + push, so a second machine stays in sync.

Two things to know about how continuity works here:
- Local Claude **memory does NOT travel** across machines. This git-tracked file
  is the handoff channel. If it is not written here, the other machine will not know it.
- **No secrets in this file, ever** (SumUp keys, Telegram bot tokens, chat ids stay
  in Vercel env / local only).

Last updated: 2026-08-29 (Priscilla's FAQ overhaul + email late-arrival line).

## Priscilla's requests from 2026-08-29 (shipped same day)

Forwarded privately to the bot (the group updates had been consumed by the other
machine's getUpdates - if that happens again, ask for a private forward).

1. **FAQ rewrites** (faqItems in all 11 dictionaries, bot knowledge updated to match):
   - "How do I make a reservation?" [8]: adds how to book online, the Multibooking
     option, and in-person booking when no online payment fits.
   - "What does breakdown service include?" [0]: fee structure changed - technical
     failures + theft recovery free; user-caused up to 20 km now 30 EUR (was free),
     over 20 km from 50 EUR + transport costs; islands unchanged; key 50 EUR now
     also covers locking the key inside.
   - "What happens if the bike is damaged?" [6]: authorized brand dealership
     (Piaggio Center Zadar, KTM Moto Spica) instead of "local mechanic", OEM parts
     only, official quotation copy.
   - "not experienced enough" [12]: "the bike" -> "the scooter or bike" (a scooter
     customer complained; Kristian approved "scooter or bike" over the literal
     "scooter" so Duke customers aren't mis-addressed next).
2. **Confirmation email**: new red line (emails.bookingConfirmed.lateLine, 11
   languages, single + group template): more than 1h late without notice =
   automatically cancelled, no refund.

Previously: 2026-08-22 (Thomas's 21.08 requests: email deposit/licence copy + tour tips).

## Thomas's requests from 2026-08-21 (all shipped 2026-08-22)

1. **Confirmation email, deposit line**: said "cash only"; the site has always promised
   PayPal/Revolut/Wise too. Per Priscilla's suggestion the email now uses the SITE's
   deposit wording (fleet.specsSection.depositText, already professionally translated),
   prefixed with the local word for deposit: emails.bookingConfirmed.bringDeposit in all
   11 dictionaries. Email and site can no longer contradict each other on this.
2. **Confirmation email, licence line**: now "a driving licence valid for the booked
   vehicle class must be shown at pickup" (Thomas verbatim), all 11 languages
   (emails.bookingConfirmed.bringLicence).
3. **Tour tips per model** (lib/tours.ts + fleet.tours dict section + a section on the
   bike detail page between the info cards and the group cross-sell): his Google Maps
   links VERBATIM. Mapping exactly as he specified: Liberty 50 (both) = Ugljan Island
   Loop + Nin Queen's Beach; Duke 125 + 390 = Pag Loop incl. Zrmanja; Beta RR 125 =
   Sveti Rok. **scooter-125 (Liberty 125) got NO route from him and renders no section -
   ask Thomas which route it should get.** Queen's Beach had no link from him; a Google
   Maps search URL stands in until he supplies one. Chatbot knowledge extended with the
   missing links (Maslenica, Sveti Rok, Queen's Beach) + the per-model mapping.
4. Bot quality praise - no action.

Previously: 2026-08-18 (chatbot logging + admin chat view, same system as the shop).

## Chatbot logging + owner corrections (2026-08-18)

Thomas asked for the same system the SickMotos shop has: every bot conversation is
logged and reviewable in the admin, plus the correction loop.

- Every /api/chatbot exchange is logged AFTER the reply is sent (`after()` +
  `lib/chat-log.ts`), so logging can never slow down or break the customer bot.
  The widget keeps a per-tab conversation id in sessionStorage so a visitor's
  messages group into one conversation.
- Admin: **/admin/chats** (nav "Bot chats") lists conversations with an
  All / Unread filter; the detail page shows the full transcript (Zadar time),
  a read/unread toggle, a note field, and a "Correct the bot" form.
- Corrections work like the shop: each correction is stored as an audit row
  (`bot_corrections`) and merged by Haiku into ONE compact knowledge document
  (`bot_knowledge`, single row), which `buildSystemPrompt` appends as an
  OWNER CORRECTIONS section with highest priority. A merge that shrinks the
  document by more than half is rejected as lossy (correction stays recorded).
- Supabase is the store (the shop uses Redis; this project has no Redis).
  Tables `chat_conversations`, `bot_corrections`, `bot_knowledge` - created
  2026-08-18 via the Management API, RLS enabled with no policies (service
  role only). Read convention from the shop kept: a failed READ must never be
  treated as "no data", or a subsequent write erases real history.

## Time dropdowns: taken slots are now visible, not hidden (2026-08-16)

Priscilla, 15.08: *"On return time, you can select a later return, but not a earlier
return. Same happen with the pick up time, but opposite, you can't select a later pick
up time. We need both."*

**Investigated: no defect in the booking logic.** Do not "fix" the filters, they are right.
- `unitsFreeForWindow` is monotone under window shrinkage, so on a multi-day range the
  pickup list can only ever lose EARLY slots and the return list only LATE ones. Her
  report is the exact inverse and cannot be produced there.
- Replayed the real BikeDetail pipeline against live `/api/availability` data over
  14383 states (6 models x 40 days x 6 lengths x 12 start pairs), running both
  auto-correct effects to a fixed point: **0 slots snap back**. Every offered option is
  genuinely selectable.
- What she hit is the SAME-DAY case (one calendar tap means from == to): the return list
  correctly starts after the pickup, the pickup list correctly ends where no free return
  follows. Both restrictions trace to real bookings (e.g. 20.08 scooter-50: three units
  out all day, the fourth leaves 09:30, so 09:00->09:30 is the only same-day window).

**Shipped (presentation only, booking logic untouched):** the pickup/return dropdowns now
render the full grid and grey out what can't be had as `HH:MM · Not available` instead of
hiding it, so a short list reads "not available" rather than "broken". New i18n key
`calendar.slotUnavailable` in all 11 dictionaries - the wording is deliberately neutral,
not "Booked", because a slot also drops out when the instant is free but the whole rental
window clashes later, and "Booked" would contradict the calendar's own half-green day.
Two invariants to keep: each option grid must stay a superset of its selectable list, and
a time already past in Zadar must be hidden rather than greyed. Details in CALENDAR_MAP.md
open-issues #17.

**Two follow-ups, both shipped 2026-08-16 after a second adversarial pass:**
- The Submit button was not gated on empty times, only Continue was. The dates block stays
  mounted during the form step, so a customer could go back up, pick a day with no free
  pickup left, and still submit; the server then answered a slot-format 400 that means
  nothing to someone looking at "-" and 0 EUR. `canSubmit` now mirrors the Continue gate,
  plus a backstop in `handleFormSubmit` for Enter-in-a-text-field.
- **Turnaround was not enforced on the new booking's own return side.** A rental could end
  at the exact minute the next one started on the last free bike, i.e. zero minutes to
  receive and prep. Fixed in all three mirrored peak loops (client + both server ones);
  details and the verification numbers in CALENDAR_MAP.md, "Turnaround buffer". The
  customer-facing note also claimed "1h between bookings" while the engine uses 30 min;
  the 11 strings now carry a `{minutes}` placeholder fed from `TURNAROUND_MINUTES`, so the
  copy cannot drift from the constant again.

**Still open, found while checking this (pre-existing, NOT introduced here, not yet fixed
because it is outside what was reported):**
- The "is this slot in the past" filter compares `iso !== zagrebNow().isoDate`, so a day
  that is already over in Zadar but still "today" for a visitor west of us (Los Angeles,
  7h/day window) offers the full slot grid; the server then rejects at submit
  (`isPickupInPast`, 400) after the customer filled in the whole form.
- The calendar itself renders `startMonth={new Date()}` and `disabled={[{before: new Date()}]}`
  with no `mounted` guard while the page is force-dynamic on a UTC server, so any visitor
  whose local date differs from UTC gets a hydration mismatch (at a month boundary the
  server and client even render different months). Fix would be one shared
  `todayZagreb` date used by the matchers and DayPicker's `today` prop.

## Riderly integration (2026-08-08) - READ THIS BEFORE TOUCHING THE POLLER

Thomas reported Riderly bookings not arriving. Four had silently never
reached the calendar. What actually happened, in order:

1. `c2e90d5` (10.05) removed the `*/15` cron from vercel.json because Vercel
   HOBBY caps crons at once per day and was rejecting every deploy. The
   comment said polling now had to be triggered from outside Vercel, so a
   **cron-job.org** job was created against `rentamotozadar.com/api/cron/poll-riderly`.
2. `80cd903` (03.07) re-added the Vercel cron after the upgrade to Pro,
   believing nothing was polling. Nobody disabled cron-job.org. From then on
   **two schedulers** hit the same Gmail mailbox every 15 min, ~30s apart.
   Damage proof: booking TZWXXL3CW7 exists TWICE in `bookings`, the rows
   inserted 24ms apart.
3. Double polling made Gmail throttle (measured 31s connect, 44s mailbox
   lock). The poller marked mail `\Seen` BEFORE the route forwarded or
   inserted anything, so a slow run hit `maxDuration = 60` (the Hobby
   ceiling) and was killed mid-flight: mail read, nobody notified, no row,
   and invisible to every later run because those only looked at unread mail.

Fixed: cron-job.org job **disabled** (not deleted, still in that account);
`maxDuration` 300; `processRiderlyInbox` replaces `pollRiderlyInbox` and
marks `\Seen` only after the handler reports success; import keys on the
booking id from the SUBJECT, not on the unread flag.

Two dedupe gates, both earned on real data during the first live run:
- marker `Riderly: <id>` in `notes` (importer-created rows)
- **hand-entered twin**: same bike + identical window + not cancelled + no
  marker. Priscilla/Thomas type Riderly bookings in by hand under the real
  rider name, so those rows carry no marker. This gate stopped RHIJ6FNB3M
  (James Woodyear-Smith) and YEGENPJAMG (Michal Majerowski) from being
  double-booked. It deliberately IGNORES marker-carrying rows, because two
  different Riderly bookings on the same model and window are legitimate on
  a multi-unit fleet.
Plus: never import a rental whose end moment has passed (Zagreb wallclock).

Still open / known:
- An unmappable Riderly bike name logs at ERROR and creates nothing. Watch
  `[cron/poll-riderly] UNMAPPED` in the Vercel logs.
- No persistent state, so a hard-deleted Riderly row can be re-imported.
- The importer never learns that a booking was later cancelled ON Riderly.

## Ghost Bike separation (2026-08-13)

Owner restated the rule: "Liberty bleibt vier, Ghost bleibt eins, getrennt."
The reserve is a separate vehicle, admin-only, assigned by hand. It must never
count as capacity. See the dedicated section in CALENDAR_MAP.md.

Removed `includeBackup: true` from all ELEVEN owner call sites (walk-in x3,
edit single+group, admin status single+group, Telegram single+group,
undo_return, customer confirm link). New helpers in lib/availability.ts:
`reserveUnitIds`, `findUnitForOwnerAction` (regular fleet, but keeps an
EXISTING ghost parking alive by validating that one unit), and
`wholeModelBlockConflict` (a season pause covers the reserve too).

Added: a **Ghost Bike option in the walk-in form**. Without it the reserve had
become unreachable for NEW walk-ins, which the full check caught as its top
finding - the server accepted an explicit reserve unit but no UI ever sent one.

Two full adversarial review rounds over every CALENDAR_MAP surface found and
fixed, among others: returned siblings still demanding a bike in both group
confirms, a ghost-parked row skipped without checking the reserve was free,
undo_return not re-pinning (two rows on one bike), and a model-wide block not
applying to the reserve.

## Done (2026-07-27, part 2) - DB reconciliation
Cross-checked raw DB against every availability surface: admin dashboard 6/6 models,
homepage badge 6/6, bike detail verified live; DB anomaly scan clean (see CALENDAR_MAP #16).
Fixed three consistency gaps: blocks route now considers PENDING bookings when placing a
per-unit block and when gating a whole-model block; the homepage badge folds in a service
block that shares a unit with a rental; the client no longer buffers block demand (fuzz-
verified equivalent to findFreeUnit over 330k states). A float-placement change to
listUnitAvailability was written and reverted after fuzzing showed it moved ghost blocks
onto regular units.

## Done (2026-07-27)
- BikeDetail slot pickers now count `manualBlocks` as demand (Wave-3 item "partial-day
  service blocks invisible client-side" - bitten live 27.07: picker offered 1 bike while
  a time-bounded block made the fleet full; server correctly 409'd "Time conflict").
  See CALENDAR_MAP.md #15.
- Thomas 27.07: "WhatsApp von Priscilla ist wieder ok" - Croatian WA unblocked again.
  All wa.me links still route to the German number (as Thomas requested 24.07); switching
  the English/PT contact back to the Croatian number is a one-line change in
  BRAND (waRaw per contact) IF Thomas asks - not done without his say-so.

## Done (2026-07-26)
- **Service blocks capacity-gated** (Priscilla 23.07 "can't block, says Antonio pickup 18/07"):
  the per-unit block path checked only PINNED bookings per unit (pin-scatter false rejects,
  unpinned demand invisible, misleading 409 naming an unrelated booking). Now gated by
  `findFreeUnits` over the block window (counts everything incl unpinned + pending + blocks);
  placement only on a pinned-free regular unit, honest 409 on genuine-full AND on pin-scatter
  (never dropped onto a busy unit id - downstream consumers key blocks by unit id). Blocks UI
  posts quantity N sequentially (parallel gate race), ghost blocks skip the gate, day-walk is
  TZ-safe. `listFleetSummary` keys blocks as their own
  physical bike (block:<id>), capped at K. Retroactive DB check: her 23.07 rejection was
  capacity-CORRECT (fleet full incl a since-cancelled 3-bike group); only the message was wrong.
  See CALENDAR_MAP.md backlog #14.
- **WhatsApp -> German number** (Thomas 24.07: Croatian number's WA blocked): new
  `BRAND.whatsappRaw`; ALL wa.me links (contact page, customer emails, owner links) use it.
  Call buttons + displayed numbers unchanged.
- Worktree hygiene: the kind-elion worktree had silently fallen 34 commits behind origin/main;
  fast-forwarded and re-applied. If you work in a worktree, `git fetch && git status -sb` FIRST.

## Done (2026-07-18) - group booking write paths
Trigger: Thomas edited one bike of Thorben's 2-bike group on 17.07, changed only one
row's time; siblings kept the old window and the group "split" (phantom conflict,
"einer zeigt frei, der zweite hängt drin"). Retroactive live audit: 4 historical split
groups (Thorben 17.07, Luna 01.07, Thomas 24.06, Damian/Oscar cancelled 29.05) - ALL
past, returned/cancelled, none active. No live split remains.
Fixes shipped (adversarially verified, tsc clean):
- lib/availability.ts: NULL-safe `excludeGroupId` (was `.neq`, which drops solo
  bookings where booking_group_id IS NULL -> latent overbooking in the admin status
  route + Telegram group confirm). Now `.or(is.null, neq.<uuid>)`.
- PATCH /api/admin/bookings/[id]: a multi-bike group now moves as ONE - shared window +
  customer fields (incl. licence) propagate to every LIVE row (status != cancelled AND
  returned_at IS NULL) in one atomic statement; capacity re-checked per sibling model;
  per-bike fields stay on the edited row; reserve never handed out on a routine edit;
  solo / 1-live-row bookings keep the byte-identical original path. Routes on live-row
  count, NOT booking_group_id truthiness (website 1-bike orders carry a uuid).
- status route: fully-cancelled group re-decide no longer reports false success.
- Telegram group confirm: capacity counts only non-cancelled rows.
DECIDED 2026-07-18 (owner delegated "simple, fewest bugs"), both shipped/settled:
- Fulfillment stays PER-BIKE by design (real partial returns exist - Thorben's bikes
  came back hours apart; group-wide would free bikes still physically out).
- Customer self-cancel is now GROUP-WIDE: cancel link drops the whole order, blocked
  if any live row is picked up; owner notified; the original owner Telegram card is
  edited on self-cancel (used to stay "confirmed" forever - solo cards too). Cancel
  page says "cancels your entire order (N bikes)". Adversarially verified SOUND.
  See CALENDAR_MAP.md backlog #13 for accepted gaps.

## Done (2026-07-18) - phantom "out" fix
Priscilla reported "Liberty top case: 2 out but only 1 out" and "Duke 125 the same".
Verified live via SQL: bookings picked up in **June** and never marked returned
(`returned_at` NULL) were being counted OUT forever. A Wave-1 change used
`max(schedEnd, now+60s)` with no upper bound in the picked-up branch; the "Currently
out" list (`bucketBookings`) auto-forgives 24h past the scheduled return, so the tile
counts (which lacked that cap) disagreed with the list. Fix: one shared
`occupancyInterval` in lib/availability.ts (picked-up = out until scheduled return,
then <=24h, then auto-forgiven) now drives ALL four now-snapshot surfaces
(`listFleetSummary`, `listUnitAvailability`, `listReserveSummary`,
`getAvailableNowCounts`). Commit d629be5. Stale June rows (Čestmír/topcase,
Dieckmann/Duke125, Andre/Liberty50) remain in the DB but are harmless now; DB stays
read-only from here.

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

## Recent (2026-07-16/17)
- Turnaround buffer counts return-side only (was both sides): fixed the phantom
  "Time conflict" on back-to-back bookings with the legal 30-min gap (Anna/Tomas case).
- Conflict card (walk-in + admin edit): structured English mobile-first card - headline,
  window, "all K out at <instant>", who has each bike + when back, green "Would fit if"
  suggestion. buildConflictCard() in lib/availability.ts; routes return `conflict`.
- Fleet card: picked-up bookings count as OUT before their booked start (2-bike group
  left 11:00, second row booked 11:30 -> showed "1 free" for 30 min).
- Ghost Bike stays visible (marked GHOST) in the model's per-unit panel by design;
  it has its own dashboard tile and never counts toward the model's K.

## Proactive consistency sweep 2026-07-17 (26 agents, adversarially verified)
Found 20 confirmed high/medium issues in two root patterns. WAVE 1 DONE + deployed:
- picked-up/returned physical state now consistent across fleet card, per-unit panel,
  homepage badge, Vespa tile (was only on the fleet card); fleet card keeps a picked-up
  bike OUT until actually returned (not just past scheduled return).
- walk-in "All (N)" no longer books the Ghost Bike reserve (is_backup filter).
- FulfillButton surfaces HTTP errors; header "pending" counts grouped; edit-cancel clears
  the conflict card.

WAVE 2 - group operations touch only ONE row (do next, write paths, careful):
- [ ] Edit PATCH (api/admin/bookings/[id]/route.ts:~275): editing a group's window/customer
      splits the group - apply shared fields to every row in booking_group_id.
- [ ] Status route (…/status:~111): re-confirming a FULLY-cancelled group updates 0 rows but
      returns ok:true -> green "confirmed" banner while badge still says CANCELLED. Detect
      0-rows and report honestly (don't silently succeed).
- [ ] Status group cancel (…/status:~125): cancelling a confirmed GROUP never emails the
      customer though the help text promises it. Send group email in the group cancel branch.
- [ ] Fulfillment (…/fulfillment:~127): pickup/return acts on one bike of a group; apply to
      the whole group (or add per-bike controls).

WAVE 3 - customer/telegram + client calendar + labels:
- [ ] Customer self-cancel (api/booking/[token]/decision:~91) never edits the original Telegram
      card -> old card still shows Confirm/Decline buttons. Edit refs to "Cancelled".
- [ ] sendOwnerCancellationTelegram hardcodes "Customer cancelled" even for owner-initiated
      cancels; add a source param like the email.
- [ ] BikeDetail calendar ignores API manualBlocks -> partial-day service blocks invisible,
      customer offered pickup times the server then rejects.
- [ ] Timezone: BikeDetail:~1008 + GroupBooking:~491 disable past days by browser clock, not
      zagrebNow() - out-of-tz visitors get a wrong "today".
- [ ] Homepage badge stays green after 18:30 Zagreb / when idle unit is boxed in within a
      slot+turnaround (no bookable slot today) while the detail calendar shows today full.
- [ ] blocks page intro paragraph describes the OLD name-inferred flow; "Recent entries" lists
      blocks oldest-first and unbounded.

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
