# SickMotos / Rent a Moto — Handover

Last refreshed 2026-05-12, end of the i18n + email-localisation + SSL session.
Earlier handover content on anchor scroll, pricing tiers, calendar UX,
the original Riderly poller etc. is unchanged; this file rewrites the
parts that drifted in the last sessions.

## What this is

Booking site for **SickMotos / Rent a Moto** (Zadar, Croatia).
Live on **rentamotozadar.com** + **www.rentamotozadar.com**, repo
`github.com/dura2507/vozivespa`, deployed via Vercel (auto-deploy
on push to `main`).

Owner = Thomas Krawietz. Phone numbers `+49 176 34658003` (DE) /
`+385 95 8195 453` (EN). Both Telegram and the booking inbox land
at the owner's chat / mailbox now.

Mail flow:
* Customer-facing brand email (`BRAND.email`) is
  `rentamotobooking@gmail.com` (was `info@sickmotos.com`, the
  info@ mailbox never existed).
* `OWNER_EMAIL` env var also `rentamotobooking@gmail.com` so
  owner booking notifications land in the same Gmail Thomas reads.
* Outbound Resend sender stays `bookings@rentamotozadar.com`.

## Stack

* Next.js 16 (Turbopack) + React 19 + TS, App Router. AGENTS.md
  is firm: **this is NOT the Next.js you know**, check
  `node_modules/next/dist/docs/...` before guessing v15 patterns.
* Tailwind v4 with `@theme {}` in `app/globals.css`.
* Supabase (DB + Storage), project `odbmkiwxydexutyqsyts`. Server-only
  via `SUPABASE_SERVICE_ROLE_KEY`, RLS on, no public policies.
* Resend for transactional email.
* Telegram bot `@SickMotosRentamoto_Bot`, owner chat `1063783447`.
* cron-job.org cronjob (id `7588251`) hits `GET /api/cron/poll-riderly`
  every minute. Vercel-internal cron on Hobby is daily-only, external
  triggers have no cap.

## Worktree

Current branch: `claude/kind-elion-1e1e37` (worktree dir matches).
Pushes go straight to `main`.

```
cd /Users/kristian.durasin/Desktop/vozivespa/.claude/worktrees/kind-elion-1e1e37
git push origin claude/kind-elion-1e1e37:main
```

## i18n

Five locales: `en`, `de`, `es`, `it`, `hr`. English is default.
The next two on the roadmap are `pl` and `fr` (user said "später").

* `lib/i18n/config.ts` — `LOCALES`, `LOCALE_LABELS`, `isLocale`,
  `DEFAULT_LOCALE`.
* `lib/i18n/dictionaries.ts` — server-only loader that dynamic-
  imports the matching JSON file per locale. Exports `Dictionary`
  type derived from the en.json shape.
* `lib/i18n/dictionaries/{en,de,es,it,hr}.json` — one big dict each.
  Every translated string lives here. Sections: `nav`, `footer`,
  `home`, `info`, `faq`, `terms` (with `sections[]` array of all 7
  T&C sections with bullets), `contact`, `gallery`, `fleet` (specs,
  pricing, tierLabel, priceBox, calendar, form with licenceOptions,
  reservation, success), `bikes[bikeId]` (description, longDescription,
  tagline, experienceNote), `faqItems[]`, `common`, `emails` (per-
  template).
* All public routes live under `app/[lang]/`. Routes that stay at
  the root: `app/admin/*`, `app/api/*`, `app/booking/[token]/*`
  (email-confirmation flow, English-only).
* `app/[lang]/layout.tsx` validates the `lang` param against
  `isLocale()` and renders children inside the root `app/layout.tsx`.
* `proxy.ts` (replaces `middleware.ts` — Next 16 rename) does two
  things: gates `/admin` + `/api/admin` via the existing
  HMAC-cookie session check, and locale-prefixes any path that does
  not start with a known locale, isn't an exempt prefix
  (`/admin`, `/api`, `/booking/`, `/_next`, `/bikes/`, etc.), and
  isn't a static file (matches anything ending in `.ext`). Locale
  detection uses `@formatjs/intl-localematcher` + `negotiator` on
  the `Accept-Language` header.
* Customer-facing client components (Navbar, Footer, BikeDetail,
  FaqAccordion, ContactForm) receive `lang: Locale` and a slice
  of the dict as props, prefixed by their parent server page.

### Language switcher (Navbar)

* Trigger shows a globe icon + two-letter code (`EN`, `DE`,
  `ES`, `IT`, `HR`) + chevron.
* Dropdown lists the language *name* only (English / Deutsch /
  Español / Italiano / Hrvatski). The two-letter code stays on
  the trigger.
* Desktop has the trigger inline in the nav row. Mobile has its
  own copy outside the burger menu, visible always.
* Menu uses a `filter: drop-shadow(...)` for depth, no Tailwind
  `shadow-*`. shadow-2xl rendered as a hard vertical line on
  dark hero backgrounds. No min-width either; the menu auto-fits
  the longest label so there is no white right-margin gap.

### Locale-aware emails

* `bookings.locale` column carries one of `en|de|es|it|hr`.
* BikeDetail submits the current page locale as `locale` field
  in the booking FormData. `/api/bookings` validates against the
  whitelist + persists.
* `lib/email.ts` customer functions (`sendCustomerBookingReceivedEmail`,
  `sendCustomerBookingDecidedEmail`, `sendCustomerContactReceivedEmail`)
  load the dict for `booking.locale` (contact uses a `locale` param
  passed by `/api/contact` from `ContactForm`) and feed every
  visible string from `dict.emails.*`.
* Owner-facing emails (`sendOwnerBookingEmail`, `sendOwnerContactEmail`)
  stay English — only Thomas reads them.
* `app/booking/[token]/*` confirmation/decline pages stay English
  (the `decision-view.tsx` server component awaits `getDictionary(DEFAULT_LOCALE)`).
* DayPicker on `/fleet/[bikeId]` imports the matching date-fns
  locale (`enUS`, `de`, `es`, `it`, `hr`) and passes it to both
  `DayPicker locale={dateLocale}` and every `format(date, ..., { locale })`
  call so weekday + month names match the page lang.

### Translation gaps still acceptable

* Admin panel + admin emails + booking-token decision pages stay
  English by design. The owner reads English fine.
* `bike.licence`, `bike.season`, bike model names stay in their
  original strings from `lib/mockData.ts`; the localised bits
  layered on top are in `dict.fleet.licenceByCode`, `dict.bikes[id].*`,
  `dict.fleet.tierLabel` etc.

## DB schema additions since the last handover

Migrations (`supabase/migrations/`):

* `2026-05-11_bike_price_overrides.sql` — per-bike day-price overrides,
  editable from `/admin/pricing`.
* `2026-05-12_booking_locale.sql` — `bookings.locale text not null
  default 'en' check (locale in (en, de, es, it))`.
* `2026-05-12_booking_locale_hr.sql` — widens the check to include
  `hr`. Drops and re-adds the constraint.

All migrations land in Studio SQL editor by hand. The user has
applied every one through 2026-05-12.

`sync_blocked_dates_for_booking` trigger is unchanged.

## Customer booking flow (`/[lang]/fleet/[bikeId]`)

Unchanged at the calendar level (`react-day-picker` v9,
`weekStartsOn={1}`, 30-min pickup slots, 60-min turnaround,
weekend tier on Fri pickup + Sun return). New since the last
handover:

* `locale` field submitted with the rest of the form
  (`fd.set("locale", lang)`).
* `licenceCountry` text input next to the licence dropdown — free
  text. The API prepends `Licence country: X` to the `notes` field
  server-side so the owner sees it in Telegram / email / admin
  without a separate schema column.
* `tBike = dict.bikes[bike.id]` overrides `bike.description`,
  `bike.longDescription`, `bike.tagline`, `bike.experienceNote`
  per locale, with mockData as English fallback.
* The "View bike" CTA on the home pricing cards is now a solid red
  "Book Now" button (used to be a text link).
* The 24h-billing callout sits inside the black price box on the
  fleet detail page: "1 day = 24 hours. Pickup-to-pickup, not
  calendar day."
* Reservation/deposit copy lists payment methods at pickup
  (cash / Revolut / PayPal / debit-credit card with fees) and is
  fully localised.

## Multi-unit availability

Unchanged. `lib/availability.ts` `findFreeUnit()` is the single
overlap source for `POST /api/bookings`, admin status PATCH,
admin booking PATCH, Telegram webhook, owner confirm route.

## Admin panel (`/admin`)

* Same HMAC cookie session (`lib/admin-session.ts`), now used by
  `proxy.ts` instead of the deprecated `middleware.ts`.
* Pages: dashboard (fleet status + booking buckets), `/admin/blocks`,
  `/admin/bookings/[id]`, `/admin/pricing` (NEW), `/admin/login`.
* `/admin/pricing` lists every bike with its current day price
  in a number input; saves through `/api/admin/pricing` POST which
  upserts into `bike_price_overrides`. Read path is `lib/bike-pricing.ts`
  `getCategoriesWithPricing()` which merges overrides onto
  `CATEGORIES` from `lib/mockData.ts`. Weekend / week / month tiers
  stay in code for now (out of scope per owner).
* Bike names in admin lists use a `shortName` field on `Category`
  (e.g. `Liberty 50 TC`) so dashboard fleet cards do not truncate.
  Customer-facing pages keep the full `model` string.
* Mobile: "View site →" link sits in the top header bar next to
  the SickMotos Admin logo. The horizontal-scroll nav under it
  carries Dashboard / Blocks / Pricing + Logout.
* Login page suppresses the admin chrome by checking the session
  inside the layout — unauthed requests get a fullscreen login
  form.

### What admin can NOT do

There is no "create booking from admin" form. The owner can:
* Add a **manual block** for a bike+date range (`/admin/blocks`) —
  blocks the calendar, no customer data.
* Confirm / decline / release an existing booking from
  `/admin/bookings/[id]` or Telegram.
* Edit a bike's day price.

Walk-in bookings without going through the customer form would
need a new "Create booking" admin route (~1h work, deferred).

## Riderly inbox polling

Production path (live as of this session):

1. Riderly sends notification emails directly to
   `rentamotobooking@gmail.com` (their support changed the
   notification address — the older `tkrawietz284@gmail.com` filter-
   forward is therefore obsolete but still in place as a backup).
2. cron-job.org cronjob `7588251` hits
   `GET https://rentamotozadar.com/api/cron/poll-riderly` once a
   minute with header `Authorization: Bearer ${CRON_SECRET}`. Was
   paused while no real Riderly mails were arriving; user enables
   it now that the address has been swapped.
3. `app/api/cron/poll-riderly/route.ts` runs `pollRiderlyInbox()`
   from `lib/riderly.ts`. Two-phase fetch: buffer unseen messages
   while holding the mailbox lock, release, mark every UID as
   `\Seen` in one batch under a fresh lock. Mixing `messageFlagsAdd`
   into an active `fetch()` iterator deadlocks imapflow, surfacing
   on Vercel as a `FUNCTION_INVOCATION_TIMEOUT` at `maxDuration`.
4. `maxDuration = 60` on the route gives cold-start IMAP connects
   room under Hobby.

### Allowlist

In `lib/riderly.ts`:

```ts
const ALLOWED_FROM = [
  "leon.huschka@duraska.com", // TEST, remove for production
  "@riderly.com",             // PRODUCTION, keep
];
```

Mails from senders not in this list are logged + marked-read silently.
The owner asked to keep `leon` in for now even though `@riderly.com`
is live, so he can keep test-mailing from Leon's address whenever
he wants. Production-only step is just deleting the Leon line.

## Gotchas already paid for

* **Vercel Hobby cron caps at once-daily.** Putting `*/15 * * * *`
  in `vercel.json` made Vercel silently reject every deploy.
  The file is gone; keep it gone. External cron via cron-job.org
  has no cap.
* **imapflow deadlocks** if you `messageFlagsAdd` mid-`fetch`.
  Buffer first, then mark seen in a single batch under a fresh
  mailbox lock. Was hitting the Vercel 60s `maxDuration` ceiling.
* **proxy.ts must exempt files with extensions** (`/\.[a-z0-9]{2,5}$/i`)
  otherwise Next's auto-detected `app/icon.svg` /
  `manifest.webmanifest` / `robots.txt` get locale-redirected to
  `/en/icon.svg` and 404. The favicon vanished the first time we
  shipped i18n because of this.
* **www.rentamotozadar.com needed its own SSL cert** in Vercel —
  the apex cert does not cover www. Both domains are now Production
  with valid configuration; SEO-canonical decision (redirect www
  to apex) is parked.
* **DayPicker needs an explicit `locale={...}` prop** in addition
  to passing `{ locale }` to every `format()` call, otherwise the
  weekday header row stays English even when the rest of the page
  is translated.
* **Sensitive Vercel env vars are write-only.** Reading
  `CRON_SECRET` requires Rotate; capture the new value at rotate
  time. We did this once during the cron-job.org setup.
* **Locale dropdown's `min-width` and `shadow-2xl` both looked
  like a hard right border** on the dark hero. Final settings:
  no min-width, plain `filter: drop-shadow(...)`, no Tailwind
  shadow class, no ring.
* **Mark-as-read must run even on Telegram error** or one bad
  email blocks every future poll run.
* **Telegram chat rate limit is 1 msg/sec/chat.** 1.2 s sleeps
  + a hard cap per run.
* **Token format must be hex**, not base64 — `+` and `/` break
  URL routing.

## Env vars

### Vercel (production)

```
NEXT_PUBLIC_SUPABASE_URL=https://odbmkiwxydexutyqsyts.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
RESEND_API_KEY=re_…
RESEND_FROM=SickMotos Bookings <bookings@rentamotozadar.com>
OWNER_EMAIL=rentamotobooking@gmail.com
NEXT_PUBLIC_SITE_URL=https://rentamotozadar.com
TELEGRAM_BOT_TOKEN=…
TELEGRAM_OWNER_CHAT_ID=1063783447
TELEGRAM_WEBHOOK_SECRET=…
ADMIN_PASSWORD=…
ADMIN_SESSION_SECRET=…
CRON_SECRET=…                       (Bearer token cron-job.org sends)
RIDERLY_IMAP_USER=rentamotobooking@gmail.com
RIDERLY_IMAP_PASSWORD=<gmail app password, no spaces>
RIDERLY_IMAP_HOST=imap.gmail.com    (optional, default)
RIDERLY_IMAP_PORT=993                (optional, default)
RIDERLY_LABEL=INBOX                  (optional, default)
```

Note: a Gmail App Password was pasted in a screenshot during
an earlier session, **rotate it before further use**.

## Open items

* **First real Riderly booking is the production check.** When
  one arrives, confirm the Telegram message has bike, dates, total,
  licence, age, plus working Accept / Reject inline buttons.
  If a field reads empty, the Riderly HTML layout drifted — fix
  the regex in `parseNewBooking` in `lib/riderly.ts`.
* **Switch allowlist to production-only** once the user gives the
  green light (remove the `leon.huschka@duraska.com` entry, push).
* **Polish + French translations** (`pl`, `fr`) are queued. Adding
  a locale is: append to `LOCALES`, add `LOCALE_LABELS` entry, add
  `loaders` entry, add date-fns locale import + map entry in
  `BikeDetail`, write the JSON dict, drop+re-add the
  `bookings_locale_check` constraint with the wider list, update
  the API validators in `app/api/bookings/route.ts` +
  `app/api/contact/route.ts`. The hr commit
  (`c2a7631`) is the template.
* **Multi-chat-ID Telegram fan-out** — user wants himself, Thomas
  and Thomas's girlfriend all to receive the booking pings. Today
  `TELEGRAM_OWNER_CHAT_ID` is single. Plan: comma-split env var,
  iterate `sendTelegram` per chat. User said he'd send the IDs.
* **Apex vs www canonical** — both are Production today. Optional
  SEO cleanup: pick one canonical, redirect the other. Owner
  doesn't care, deferred.
* **Storage receipts cleanup** — Supabase `booking-receipts`
  bucket may have stale test screenshots. Not visible to anyone
  (bucket is private + signed URLs only) but worth tidying when
  someone is in Studio.
* **Google reviews sync** — manual paste only. Auto-sync via
  Google Places API was blocked by Google's card-verification step
  rejecting every card the owner tried. Parked.
* **Translate the admin panel** — deliberately skipped; owner reads
  English. Mention only if a non-Thomas owner ever takes over.
* **Phone country-code dropdown** — deliberately skipped, owner
  is OK with manual `+49` style.

## Conventions

* All new strings English in code first, translations added to
  every dict file in the same commit.
* **No emojis** in UI or notifications except flag emojis in the
  "we speak" labels (`BRAND.languages`, `BRAND.contacts[].languages`)
  and check / cross / arrow marks (`✓ ✗ →`). User is firm on this.
* No AI em-dashes (`—`); prefer plain hyphens or rewrite to comma /
  period.
* Auto-commit + push after each logical chunk (memory file
  `feedback_auto_push.md`). Vercel auto-deploys.
* Co-author commits with the current Claude model.
* Never push migrations + dependent code in the same shot. Migrate
  first, wait for confirmation, then push code.

## Things the agent CANNOT do directly

These are walls a fresh session will hit. Write the step out and
have the user click.

* **Vercel env vars + redeploy.** Web-UI only. Sensitive vars are
  write-only; the only way to read one is Rotate + capture the new
  value immediately. Triggering a redeploy after an env change is
  also a click in the Deployments tab.
* **Vercel domain settings** (apex / www / SSL cert refresh).
* **cron-job.org cronjob** — schedule, headers, enable/disable.
  Login is the owner's account.
* **Supabase Studio** — applying migrations, ad-hoc DELETEs,
  RLS checks, Storage bucket admin (`booking-receipts` was created
  by hand). Studio confirms destructive operations behind a modal
  ("Run this query") which must be clicked.
* **GitHub PAT can't push `.github/workflows/`**; that directory
  is fully gone since the GitHub Actions poller was removed, but
  if anything ever lands back there, the user has to edit it on
  github.com via the pencil icon.
* **Gmail filter on the owner's real inbox** — owner-only.
* **Gmail App Password creation** — account holder only,
  requires 2FA fully on at `myaccount.google.com/apppasswords`.
* **Telegram `setWebhook`** — one-shot curl. Bot token isn't in
  the shell.
* **Domain registrar / DNS at the registrar level** — owner-managed.

## Browser automation

Claude-in-Chrome MCP works on this user's setup once the right
browser is selected. The Anthropic account is paired with two
Chrome instances (Kristian's Mac + Leon's Mac); usually only one
is connected at a time. After login on a fresh device, call
`list_connected_browsers` then `select_browser` with the matching
deviceId. The MCP can navigate Vercel / Supabase / cron-job.org;
sensitive credentials should still flow through chat where the
user confirms each step. Screenshots occasionally fail with
"Cannot access a chrome-extension:// URL" when another extension
(password manager) opens a popup — navigate away and back to
reset.

## How to continue in a fresh session

1. `cd /Users/kristian.durasin/Desktop/vozivespa/.claude/worktrees/kind-elion-1e1e37`
2. `git status`, `git log --oneline -20` to orient.
3. `npx next build` to verify before any code change.
4. Read this file + `AGENTS.md` + memory dir before touching
   Next.js APIs.
5. Push to `main`: `git push origin claude/kind-elion-1e1e37:main`.

## Recent commits (top of branch, newest first)

* `Telegram: drop the decided_at timestamp from the status banner`
* `Admin mobile: lift "View site" out of the scroll row into the header`
* `Revert rounded corners on lang dropdown`
* `Lang dropdown: drop min-width so it auto-fits the longest label`
* `Lang dropdown: soft filter drop-shadow, rounded corners`
* `Navbar lang dropdown: drop the ring, shadow-only`
* `Add Croatian (hr) locale + dropdown chrome cleanup`
* `i18n polish round 4: favicon, lang labels, licence form`
* `i18n round 3: tier labels, licence country, globe icon`
* `Localised customer emails: receipt, confirmed, declined, contact`
* `i18n polish: flags back on we-speak labels, localised licence/calendar`
* `i18n round 2: no emojis, mobile lang switcher, full bike detail copy`
* `i18n: en/de/es/it locales with [lang] routes and language switcher`
* `Brand email: switch info@sickmotos.com to rentamotobooking@gmail.com`
* `Fleet detail: spell out pickup-time and deposit payment options`
* `Navbar: remove mobile sticky Book Now bar`
* `New owner photos for Beta RR 125 and Duke 125 + Book Now CTA upgrade`
* `Home pricing cards: rename CTA to "Book Now"`
* `Dead code sweep: drop GitHub Actions poller and mock blocked dates`
* `Riderly poll: two-phase fetch to fix imapflow deadlock`
