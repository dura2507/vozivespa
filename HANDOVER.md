# SickMotos / Rent a Moto — Project Handover

Last updated: end of current session, 2026-05-09 onwards.

## What this is

Marketing + booking site for **SickMotos / Rent a Moto** — a Vespa /
scooter / motorbike rental in Zadar, Croatia. Custom domain
**rentamotozadar.com** on Vercel, repo at
`github.com/dura2507/vozivespa`.

Memory shows the project was originally built as a static Next.js
prototype, then we layered on a real booking backend (Supabase),
owner notifications via Telegram, customer emails via Resend, and a
self-cancel flow.

## Tech stack

* **Next.js 16** (Turbopack) + **React 19** + **TypeScript**, App
  Router. ⚠️ "This is NOT the Next.js you know" — see `AGENTS.md`.
  Read `node_modules/next/dist/docs/01-app/...` before assuming v15
  patterns.
* **Tailwind v4** with `@theme { … }` in `app/globals.css`.
* **Supabase** for DB (free tier project
  `odbmkiwxydexutyqsyts`).
* **Resend** for transactional email, sender domain
  `bookings@rentamotozadar.com` (verified).
* **Telegram** (bot `@SickMotosRentamoto_Bot`) for owner
  notifications.
* **Vercel** for hosting + DNS.

## Repos / accounts referenced in code

* GitHub: `github.com/dura2507/vozivespa`
* Vercel project: `vozivespa`, custom domain `rentamotozadar.com`
* Supabase project URL:
  `https://odbmkiwxydexutyqsyts.supabase.co`
* Owner email (notifications): `duraskastudios@gmail.com`
* DE contact: `+49 176 34658003`
* EN contact: `+385 95 8195 453`
* Telegram chat id (owner): `1063783447`

Memory file: see
`/Users/kristian.durasin/.claude/projects/-Users-kristian-durasin-Desktop-vozivespa/memory/`
for `project_vozivespa.md` and `feedback_auto_push.md`. The latter
says: **after each chunk of changes, auto-commit + push to main —
Vercel auto-deploys, owner shares the live URL with the client and
expects every change to land on the live site without a round-trip**.

## Worktree

We work in
`/Users/kristian.durasin/Desktop/vozivespa/.claude/worktrees/modest-dijkstra-cbe016/`,
which pushes its branch `claude/modest-dijkstra-cbe016` straight to
remote `main`.

## Pages and routes

* `/` — homepage (hero, fleet grid, included, good-to-know,
  how-it-works, reviews, gallery strip, CTA)
* `/fleet/[bikeId]` — single bike: hero + specs + pricing tiers
  + policy strip + interactive booking calendar + form + success
  state. The whole booking flow is on this page.
* `/bookings` — redirects to `/#fleet` (legacy)
* `/contact` — contact info tiles (DE / EN with Call + WhatsApp
  buttons each) and a contact form
* `/info`, `/faq`, `/gallery`
* `/booking/[token]/confirm` — owner-clickable from email (legacy
  fallback; main path is now Telegram inline buttons)
* `/booking/[token]/decline`
* `/booking/[token]/cancel` — customer self-cancel from
  confirmation email

API route handlers:

* `POST /api/bookings` — validates, creates booking with status
  `pending`, fires Telegram + customer email via `after()`
* `GET  /api/availability?bikeId=…` — blocked_dates for the
  calendar
* `POST /api/contact` — contact form: emails owner + Telegram +
  customer ack
* `POST /api/telegram/webhook` — Telegram callback handler. Set
  via setWebhook with header
  `X-Telegram-Bot-Api-Secret-Token`.

## Database schema

See `supabase/schema.sql`. Three tables, RLS enabled with no
policies (server-side only via service-role key):

* `bikes` — `id` (matches `lib/mockData.ts` ids) + `active` +
  `created_at`. Display data lives in `lib/mockData.ts`, NOT the
  DB, so we don't double-maintain.
* `bookings` — id, bike_id, customer_name/email/phone, notes,
  date_from/to, total_price_cents, status (`pending` |
  `confirmed` | `declined` | `cancelled`), `secret_token`
  (URL-safe hex), created_at, decided_at.
* `blocked_dates` — bike_id, date_from/to, booking_id (null →
  manual block, set → auto from booking).

**Trigger** `sync_blocked_dates_for_booking` fires on
`UPDATE OF status` on bookings: when status flips into
`confirmed` we insert a blocked_dates row; when it flips out of
`confirmed` we delete it. So owner toggle in Telegram, customer
self-cancel, all "just work" — calendar updates automatically.

Token format is **hex** (24 random bytes via `gen_random_bytes`)
because base64 produced `+` and `/` which break URL routing.

## Booking flow

1. Customer on `/fleet/[bikeId]`, picks dates in the calendar
   (`react-day-picker` v9), fills name/email/phone/notes,
   clicks **Send Request**.
2. `POST /api/bookings` validates, refuses overlap with any
   existing blocked_dates (returns 409), inserts row with status
   `pending`. Returns id+status to client.
3. Server `after()` (so Vercel function lifecycle stays alive)
   fires:
   * **Telegram message** to owner with bike/dates/customer +
     inline `✓ Confirm` / `✗ Decline` callback buttons +
     `💬 WhatsApp Customer` URL button.
   * **Customer email** "Got your request" via Resend, with
     DE+EN Call/WhatsApp button pairs in the body.
4. Owner taps Confirm or Decline in Telegram →
   `/api/telegram/webhook` (validated via secret_token header)
   flips DB status. Trigger fires, blocked_dates updates
   automatically, Telegram message edits in place to show
   `✅ Confirmed at HH:MM` / `❌ Declined at HH:MM`, and the
   button row now reads `↻ Release dates` (or `✓ Confirm
   anyway` if reverse). Customer email "✓ Confirmed —
   pickup info" or "Update on your booking — declined".
5. Confirmation email contains a `Cancel this booking` link
   (`/booking/[token]/cancel`). Customer self-cancel → status
   `cancelled` → trigger releases dates → owner gets a Telegram
   "🚫 Customer cancelled — dates released" alert.

Customer email transitions are sent **only on the first
out-of-pending move** so toggles don't spam.

All Telegram and email calls go through `lib/retry.ts` —
exponential backoff (500ms/1s/2s/4s) on network/5xx blips so we
don't lose a notification to a transient failure.

## Pricing tiers

`lib/mockData.ts` `Category.pricing` has `day / weekend / week /
month` strings. The bike-detail page calculator picks the
**cheapest** valid combination on the selected range:

* Day-only: `day × nights`
* Weekend: only if `nights === 2` and `from.getDay() === 5` (Fri)
* Week: `weeks × week + leftover × day` for `nights >= 7`
* Month: `months × month + leftover × day` for `nights >= 30`

Renders a small caption under the total like "Weekend rate
(Fri-Sun)" / "Week rate" / "Week + day mix" when the applied tier
beats plain daily.

## Calendar UX

* `mode="range"`, `excludeDisabled`, `min={1}` — can't pick a
  range that crosses booked dates, must be at least 1 night.
* `disabled={[{ before: today }, ...blocked]}` — past + booked.
* Past days: dimmed `text-ink/20` (just visually muted).
* Booked days: `bg-ink/10 text-ink/40 line-through` via
  `modifiersClassNames` so they read clearly different from past.
* `availability` is fetched live from `/api/availability` on
  mount of the detail page.

## Notifications

* Owner notifications go to **Telegram only** (no email for
  owner). Email helper still exists in `lib/email.ts` for the
  customer flow + `sendOwnerContactEmail` helper for contact
  form.
* Resend env: `RESEND_API_KEY`, `RESEND_FROM` =
  `SickMotos Bookings <bookings@rentamotozadar.com>`.
* Telegram env: `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`.
* Webhook URL set via:
  ```
  curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://rentamotozadar.com/api/telegram/webhook","secret_token":"…"}'
  ```

## Anchor scroll

Big saga. Final solution is `components/AnchorOffsetFix.tsx`
mounted in the root layout — JS-based.

* **Capture-phase** click listener on document so it beats
  next/link's onClick.
* **`preventDefault()` only**, no `stopPropagation()` — that
  way mobile dropdown links can still run their `setOpen(false)`
  React onClick handler. Stop-prop'ing was the cause of "second
  click does nothing": it kept the dropdown open, and on the
  next click my `header.getBoundingClientRect()` measured the
  full open dropdown (~500px) and scrolled hundreds of px past
  the section.
* Measures **only the inner top-bar** (`header > div` first
  child, the one with inline `height: 6.5rem`), NOT the whole
  header. Fixes mobile-dropdown-open height blowups.
* Two `requestAnimationFrame`s before the actual scroll, so
  React commits state changes (dropdown closing) and DOM
  reflows before we measure.
* Scrolls to `target.top - navHeight + 1` — 1px overshoot into
  the navbar to absorb sub-pixel rounding so the previous
  section's edge stays hidden.
* Updates `window.location.hash` with `history.pushState` so
  the URL bar follows.
* Cmd/Ctrl/Shift/Alt clicks pass through (open-in-new-tab
  still works).

Plus all navbar Links pointing at hash routes have
`scroll={false}` so next/link doesn't try its own scroll on top
of mine.

## Bike data

Source of truth: `lib/mockData.ts` → `CATEGORIES`. Each entry
has id, name, model, pricing tiers, maxSpeed, displacement,
seats, tank, range, year, image, gallery (multi-photo
thumbnails on detail page), licenceCode (`AM/B` / `A1` / `A2`)
and `experienceNote` (rendered as red "Heads up" callout —
50cc Liberty variants currently flag "Previous riding
experience required - no first-time riders").

Licence badges are real PNGs in `public/badges/licence-{a1,a2,am-b}.png`,
mapped via `LICENCE_BADGE`.

## Brand contacts

`BRAND.contacts` is a typed array. `[0]` = DE 🇩🇪 +49 number,
`[1]` = EN 🇬🇧 +385 number. Footer + Contact page render Call
+ WhatsApp button per contact. Customer emails render the same
DE+EN button pair via `contactButtonsHtml()` in `lib/email.ts`.

## Outstanding TODOs from the owner

In rough priority order:

1. **Pickup/return time slots, restricted to 09:00–19:00.** No
   bookings outside opening hours, so the booking form needs
   pickup-time + return-time pickers limited to that window.
   This will also affect the "weekend Fri-Sun" pricing logic —
   we'll likely want to treat Friday morning → Sunday evening
   as the weekend tier, or whatever the owner clarifies.

2. **Form fields.** Add Riding Style (Solo / With passenger),
   Drivers Licence dropdown (A1 / A2 / A / B / AM), Licence
   Country. Drop Age — owner explicitly said no.

3. **Phone field with country-code dropdown.** Owner OK to keep
   the manual `+49` style for now; revisit if confusing.
   `react-phone-number-input` is the recommended library
   (~16kB gzipped, all flags/codes built in).

4. **Screenshot upload for the deposit receipt.** 20% booking
   fee is paid externally; customer should attach a screenshot
   on the booking form and the owner sees it in the Telegram
   notification + email. Probably uses Supabase Storage.

5. **Multi-bike inventory.** Owner has multiple physical bikes
   per model: `1× Liberty 125, 4× Liberty 50 ohne Topcase, 4×
   Liberty 50 mit Topcase, 2× Duke 390, 2× Duke 125, 1× Beta
   125`. Currently the app treats each `bike-id` as a single
   unit. Need a `bike_units` capacity-aware availability check:
   a date is fully blocked only when ALL units of that model
   are taken. Bigger DB-schema change.

6. **Mini admin page** (`/admin/bookings`?). Owner-protected
   list of all bookings with manual edit (date_to shorten),
   manual block, set status to `cancelled` instead of
   `declined` for after-the-fact toggles, etc. The owner
   currently uses Supabase Studio for these edits.

7. **Reservations T&Cs page update** — owner has a written
   sheet ("Scooter and Motorbike Reservation Terms &
   Conditions") that should be on the site verbatim or close
   to it. Most points are in `lib/mockData.ts` `FAQ_ITEMS`
   already; the missing or differently-worded ones still need
   merging.

8. **Layout polish** — owner sometimes sends "this needs to
   move" notes; treat as small drive-by edits.

## Conventions / style

* All new strings are in **English**. Owner switched the site
  to English; full-translation pass is "ganz zum Schluss".
* No AI em-dashes (—); use plain hyphens or proper en-dashes
  consistently. The owner has been clear about this — there
  was a request to nuke them across the project.
* Auto-commit + push after each logical chunk per memory
  feedback. Skip commit only if change is broken/incomplete or
  only touches local-only config.
* Co-author each commit with `Co-Authored-By: Claude Sonnet
  4.6 <noreply@anthropic.com>`.

## Env vars (set on Vercel + `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://odbmkiwxydexutyqsyts.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
RESEND_API_KEY=re_…
RESEND_FROM=SickMotos Bookings <bookings@rentamotozadar.com>
OWNER_EMAIL=duraskastudios@gmail.com
NEXT_PUBLIC_SITE_URL=https://rentamotozadar.com
TELEGRAM_BOT_TOKEN=…
TELEGRAM_OWNER_CHAT_ID=1063783447
TELEGRAM_WEBHOOK_SECRET=…
```

Actual secret values live only in `.env.local` (gitignored)
and Vercel's env-vars panel — don't paste them into the repo.

## Recent commit log (chronological top of branch)

* `Pricing tiers in calendar, info-page reshuffle, scroll={false}`
* `Anchor fix: measure top-bar only, let React onClick siblings run`
* `Tighten anchor offset — eat the last sliver of hero edge`
* `Anchor handler runs in capture phase so it beats next/link`
* `JS-based anchor offset (CSS scroll-padding wasn't reliable) +
  DE/EN contacts in emails`
* `Anchor scrolls past hero edge; Call+WhatsApp buttons in
  customer emails`
* `Customer self-cancel from email + cleaner success screen`
* `Owner notification: Telegram instead of email`
* `Wire up Supabase: client helpers + schema for bookings`
* … older marketing/site polish below.

## How to keep moving

1. `cd /Users/kristian.durasin/Desktop/vozivespa/.claude/worktrees/modest-dijkstra-cbe016`
2. `npm run dev` for local tweaks; `npx next build` to verify.
3. Commit + `git push origin
   claude/modest-dijkstra-cbe016:main` after each logical
   chunk. Vercel auto-deploys.
4. Read `node_modules/next/dist/docs/01-app/...` before
   guessing at any Next.js API.
