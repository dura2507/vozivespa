# SickMotos / Rent a Moto — Handover

Last refreshed end of session 2026-05-11. Earlier handover sections
on anchor scroll, pricing tiers, calendar UX etc. are unchanged —
this file rewrites only the parts that drifted.

## What this is

Booking site for **SickMotos / Rent a Moto** (Zadar, Croatia).
Live on **rentamotozadar.com**, repo `github.com/dura2507/vozivespa`,
deployed via Vercel (auto-deploy on push to `main`).

Owner = Thomas. Calls go to `+49 176 34658003` (DE) and
`+385 95 8195 453` (EN). Owner Gmail for booking notifications:
`duraskastudios@gmail.com` is the dev/test inbox; the real owner's
Riderly inbox is `tkrawietz284@gmail.com` (filter-forwards to
`rentamotobooking@gmail.com`, see Riderly section).

## Stack

* Next.js 16 (Turbopack) + React 19 + TS, App Router.
  **AGENTS.md: this is NOT the Next.js you know** — check
  `node_modules/next/dist/docs/...` before guessing v15 patterns.
* Tailwind v4 with `@theme {}` in `app/globals.css`.
* Supabase (DB + Storage), free tier, project
  `odbmkiwxydexutyqsyts`. Server-only via `SUPABASE_SERVICE_ROLE_KEY`,
  RLS is on with no public policies.
* Resend for transactional email, sender
  `bookings@rentamotozadar.com`.
* Telegram bot `@SickMotosRentamoto_Bot`, owner chat
  `1063783447`.
* GitHub Actions for the Riderly poller (Vercel cron is Hobby-tier
  locked to daily, so we run it as a workflow).

## Worktree

Current branch: `claude/dazzling-joliot-82649c` (the worktree dir
name matches). Pushes go straight to `main`.

## Major features in the codebase right now

### Customer booking flow (`/fleet/[bikeId]`)

* `react-day-picker` v9 calendar with `weekStartsOn={1}` (Mon-Sun).
* **Half-cell rendering** for pickup/return day (only the half of
  the cell that's actually blocked is shaded).
* **30-min pickup/return slots between 09:00 and 19:00**, generated
  by `buildSlots()` in `lib/pricing.ts`.
* **Time-aware overlap** with 60-min `TURNAROUND_MINUTES` buffer
  between back-to-back bookings.
* **Weekend tier** detected as Fri pickup + Sun return; calculator
  picks the cheapest of day / weekend / week / month combinations.
* Form fields: name, email, phone, notes, **Drivers Licence**
  (`AM` / `A1` / `A2` / `A` / `B`), **Riding Style** (`Solo` /
  `With passenger`; auto-locked to Solo on 1-seat Beta).
* **Deposit screenshot upload** — multipart/form-data POST with
  4 MB cap (Vercel body limit is 4.5 MB). Payment options: PayPal
  F&F, PayPal Company, SEPA. IBAN displays with spaces, copies
  without.
* On success: `/api/bookings` validates, runs `findFreeUnit`,
  inserts the booking, uploads receipt to `booking-receipts`
  bucket, patches `deposit_screenshot_path`, fires owner Telegram +
  owner email + customer ack email via `after()`.

### Multi-unit availability

Owner has a real fleet (1× Liberty 125, 4× Liberty 50 no top-case,
4× Liberty 50 top-case, 2× Duke 390, 2× Duke 125, 1× Beta 125).
A bike-model date is only fully blocked when **every** unit is
booked.

* `bike_units` table, `bookings.bike_unit_id` FK.
* `lib/availability.ts` exports a single `findFreeUnit(bikeId, …)`
  that returns either `{ unitId }` or `{ conflict }`. All callers
  use it: `POST /api/bookings`, admin status PATCH, admin booking
  PATCH, Telegram webhook, owner confirm route.
* `lib/pricing.ts` `fullyBookedDates()` is multi-unit aware.

### Admin panel (`/admin`)

* HMAC-signed cookie session (`lib/admin-session.ts`), Web Crypto
  based so it's Edge-compatible. `middleware.ts` gates
  `/admin/:path*` and `/api/admin/:path*`.
* Pages: dashboard with Fleet status cards + booking buckets
  (out / pending / upcoming / past); `/admin/bookings/[id]` with
  status-aware action buttons; `/admin/blocks` manual blocks;
  `/admin/login`.
* `lib/admin-data.ts` is the server-side data layer.

### T&Cs page (`/terms`)

Verbatim from the owner's PDF screenshots, 7 sections (Reservations,
Deposit & Payment, Pick-up & Return, Insurance & Safety,
Damage/Repair/Breakdown, Fuel, Driver requirements).

### Riderly inbox polling

The owner runs a separate booking site (`riderly.com`) with no API.
Their notification mails contain magic accept/reject URLs the
owner can hit without login, so we mirror those into Telegram as
inline buttons.

Pipeline:

1. Owner's real Gmail `tkrawietz284@gmail.com` has a filter
   `from:reservations@riderly.com` → forward to
   `rentamotobooking@gmail.com`. (Owner still needs to set up
   this filter on his side.)
2. GitHub Actions workflow `.github/workflows/poll-riderly.yml`
   runs `*/15 * * * *` and invokes `scripts/poll-riderly.mjs`.
3. The script IMAPs `rentamotobooking@gmail.com`, fetches unseen
   messages, **buffers them all** (avoids the imapflow deadlock —
   you cannot `messageFlagsAdd` while still iterating `fetch()`),
   releases the lock, then classifies via `lib/riderly.ts` →
   sends Telegram (`sendOwnerRiderlyTelegram`) with 1.2 s gaps to
   stay under Telegram's 1-msg/sec/chat → marks each UID as
   `\Seen` in a batch.
4. 15 s `AbortController` timeout on Telegram fetches; mark-as-read
   happens **even if Telegram fails** so we don't loop forever on
   a bad message. `MAX_MESSAGES_PER_RUN = 15`.

**Production-switch trigger** lives in `scripts/poll-riderly.mjs`:

```js
const ALLOWED_FROM = [
  "leon.huschka@duraska.com", // TEST — remove for production
  "@riderly.com",             // PRODUCTION — keep
];
```

Anything not matching is logged + marked-read silently. Once user
confirms test phase is done, **delete the Leon line** and push.

Old `app/api/cron/poll-riderly/route.ts` + `lib/riderly.ts` are
still in the repo. They're harmless: the route requires
`CRON_SECRET` and nobody calls it. Vercel cron config is gone.
The GitHub Actions workflow is the live path.

## Gotchas already paid for (don't relearn)

* **Vercel Hobby cron caps at once-daily.** Putting
  `*/15 * * * *` in `vercel.json` made Vercel silently reject
  *every* deploy. The file is gone now; keep it gone unless we
  upgrade to Pro.
* **Vercel serverless can't reliably do IMAP** even with
  `maxDuration = 60`. Use GitHub Actions for IMAP.
* **imapflow deadlocks** if you call `messageFlagsAdd` mid-`fetch`.
  Buffer first, then act.
* **Google App Passwords require 2FA fully on.** The settings page
  only appears once 2FA is active.
* **Telegram has no default fetch timeout in Node.** Always pass
  an `AbortController`.
* **Telegram chat rate limit is 1 msg/sec/chat.** 1.2 s sleeps
  + a hard cap per run.
* **PATs can't push `.github/workflows/`.** Edit on the GitHub
  web UI.
* **Mark-as-read must run even on Telegram error**, or one bad
  email blocks every future run.
* **Token format must be hex** (not base64) — `+` and `/` break
  URL routing.

## DB schema notes added this session

Migrations are additive + idempotent (live in
`supabase/migrations/`). Don't repeat-run a non-idempotent migration
on prod. Columns added since the original handover:

* `bookings.pickup_time`, `bookings.return_time` (text, "HH:MM")
* `bookings.payment_method` (enum-ish text:
  `paypal_ff | paypal_company | sepa`)
* `bookings.deposit_screenshot_path` (Supabase Storage key)
* `bookings.drivers_licence`, `bookings.riding_style`
* `bookings.bike_unit_id` (FK → `bike_units.id`, nullable)
* `bike_units` (id, bike_id, label, active)

`sync_blocked_dates_for_booking` trigger is unchanged.

## Env vars

### Vercel (production)

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
ADMIN_PASSWORD=…
ADMIN_SESSION_SECRET=…
```

### GitHub Actions secrets (for the Riderly poller)

```
RIDERLY_IMAP_USER=rentamotobooking@gmail.com
RIDERLY_IMAP_PASSWORD=<gmail app password, no spaces>
RIDERLY_IMAP_HOST=imap.gmail.com   (optional, default)
RIDERLY_IMAP_PORT=993               (optional, default)
RIDERLY_LABEL=INBOX                 (optional, default)
TELEGRAM_BOT_TOKEN=…
TELEGRAM_OWNER_CHAT_ID=1063783447
```

Note: a Gmail App Password was pasted in a screenshot during
this session — **rotate it before production rollout**.

## Open items

* **Confirm Riderly test phase passes** (user is actively sending
  test mails from non-Leon senders to verify they're skipped).
  When confirmed: delete the `"leon.huschka@duraska.com"` line
  from `ALLOWED_FROM`, push.
* **Owner sets up Gmail filter** on `tkrawietz284@gmail.com`:
  `from:reservations@riderly.com` → forward to
  `rentamotobooking@gmail.com`.
* **Optional**: `cache: 'npm'` on `setup-node@v4` in
  `.github/workflows/poll-riderly.yml` to speed up cold runs.
  (Edit via GitHub web UI — PAT can't push workflow files.)
* **Rotate the leaked Gmail App Password.**
* **Google reviews sync** still deferred — manual paste of 4-6
  real reviews, or Google Places API.
* Phone country-code dropdown deliberately skipped (owner OK
  with manual `+49` style).

## Conventions

* All new strings English. **No emojis** anywhere in UI or
  notifications — user is very firm on this. Flags + `✓ ✗ →`
  symbols are fine.
* No AI em-dashes (`—`) gratuitously; plain hyphens.
* Auto-commit + push after each logical chunk (see memory
  `feedback_auto_push.md`). Vercel auto-deploys.
* Co-author commits with the current Claude model.
* Never push migrations and dependent code in the same shot —
  always migrate first, wait for confirmation, then push code.

## Things the agent CANNOT do directly — always ask the user

These are walls a fresh session will hit. Don't waste turns trying;
write the step out and have the user click it.

* **Edit `.github/workflows/*.yml`** — GitHub blocks workflow
  pushes from PATs without the `workflow` scope. Tell the user
  exactly what line to change and have them edit on
  github.com via the pencil icon → Commit changes.
* **GitHub Secrets** (Settings → Secrets and variables → Actions).
  Adding / rotating any of `RIDERLY_IMAP_*`, `TELEGRAM_*` etc. is
  web-UI only.
* **Vercel env vars + redeploy.** Adding/changing prod env vars
  is web-UI only; after a change the user has to trigger a
  redeploy from the Deployments tab.
* **Supabase Studio** — running ad-hoc SQL, checking RLS, or
  creating buckets (`booking-receipts` was created by hand).
  Migrations live in `supabase/migrations/` but applying them
  to prod happens via Studio SQL editor.
* **Gmail filter on the owner's real inbox** — only the owner
  himself can configure forwarding from `tkrawietz284@gmail.com`
  to `rentamotobooking@gmail.com`. The poller is useless until
  he does this.
* **Gmail App Password creation** — requires 2FA fully on for
  that account; only the account holder can generate one at
  `myaccount.google.com/apppasswords`.
* **Telegram `setWebhook`** — one-shot `curl` the user runs
  themselves (or we paste the command and they execute it).
  Bot token is not in our shell.
* **Domain / DNS on Vercel** — owner-managed.
* **Browser automation MCP is unreliable here** — the user
  cannot see the tab Claude opens. Don't depend on it. Walk
  the user through screenshots instead.

## Current workflow file (for reference)

`.github/workflows/poll-riderly.yml`:

```yaml
name: Poll Riderly inbox
on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch: {}
permissions: {}
concurrency:
  group: poll-riderly
  cancel-in-progress: false
jobs:
  poll:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci --ignore-scripts
      - run: node scripts/poll-riderly.mjs
        env:
          RIDERLY_IMAP_USER: ${{ secrets.RIDERLY_IMAP_USER }}
          RIDERLY_IMAP_PASSWORD: ${{ secrets.RIDERLY_IMAP_PASSWORD }}
          RIDERLY_LABEL: ${{ secrets.RIDERLY_LABEL }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_OWNER_CHAT_ID: ${{ secrets.TELEGRAM_OWNER_CHAT_ID }}
```

`concurrency.group` prevents two ticks from overlapping if a run
exceeds 15 min; `cancel-in-progress: false` lets the older one
finish (we never want to interrupt mid-IMAP).

## How to continue in a fresh session

1. `cd /Users/kristian.durasin/Desktop/vozivespa/.claude/worktrees/dazzling-joliot-82649c`
2. `git status`, `git log --oneline -20` to orient.
3. `npm run dev` for local; `npx next build` to verify.
4. Read this file + `AGENTS.md` + memory dir before touching
   Next.js APIs.
5. Push to `main`:
   `git push origin claude/dazzling-joliot-82649c:main`.

## Recent commits (top of branch)

* `Add HANDOVER.md so a fresh agent can pick this up cold`
* `Pricing tiers in calendar, info-page reshuffle, scroll={false}
  on hash links`
* `Anchor fix: measure top-bar only, let React onClick siblings run`
* `Tighten anchor offset — eat the last sliver of hero edge`
* `Anchor handler runs in capture phase so it beats next/link`
* Riderly poller series: env-based FROM filter → reverted →
  X-Forwarded-For → hardcoded `ALLOWED_FROM` allowlist
  (final: `ae75758`).
