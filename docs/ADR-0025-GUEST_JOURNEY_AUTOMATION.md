# ADR-0025 — Guest Journey Automation (Prompt 102)

## Status
Accepted. Implemented in migration `0024_guest_journey_automation.sql` plus the
`src/features/guest-journey/*` module and the `/dashboard/guest-journey/*`
admin surface.

## Context
The platform already exposed a stay portal (`/stay/[token]`), a
guest-services catalog, an in-app concierge, and an owner-side calendar
(Prompt 101). What was missing was a **deterministic time-anchored
orchestration layer** that walks each booking through pre-arrival → post-stay
and surfaces the right CTA at the right moment — without paying for an LLM
on every dispatch and without tripping over the privacy contracts owed to
guests, owners, and OTAs.

## Decision

### 1. Deterministic journey rules
A `guest_journey_rules` table stores `(stage, anchor, offset_minutes,
channel, suggestion_type, scope)`. The runner is **pure**: given a
`(booking, rule)` pair it computes a single `scheduled_for` timestamp and
inserts/updates a `guest_journey_runs` row. Idempotency is enforced at the
DB layer via a unique index on `(booking_id, rule_id)` for runs and
`(booking_id, rule_id) WHERE rule_id IS NOT NULL` for suggestions. Cron
firing the runner repeatedly is safe.

### 2. Suggestions are CTAs, not purchases
A `guest_journey_suggestions` row materialises into the "Recommended now"
band on `/stay/[token]`. Its `cta_href` always lands on an existing
surface — `/stay/[token]/services?service=<key>`, `/stay/[token]/guide`,
`/stay/[token]/check-out`, `/stay/[token]/review`, etc. We deliberately
do not auto-buy, auto-confirm, or proxy payments. A suggestion only fires
a notification if the rule names a `template_key`; otherwise it just sits
in the panel until the guest clicks or dismisses.

### 3. Review request routing
`pickReviewChannelForBooking` deterministically routes a checkout to one
of: `internal_survey` (direct / manual), `airbnb`, `booking_com`,
`google`. The CTA URL is the **public review surface** of the channel —
we never hit OTA APIs. Direct/manual stays survey through
`/stay/[token]/review` (token-gated). Each request has a stable
`(booking_id, channel)` unique row; reminders use a separate
`request_stage` so dedupe keys don't collide.

### 4. Owner-visible event rebuild
The Prompt 101 stub at `refreshOwnerVisibleEventsAction` is replaced.
`rebuildOwnerVisibleEventsForOwner` now merges canonical sources:
- bookings (masked `Emma W.` label, channel name, headcount only),
- `villa_calendar_blocks` (generic "Maintenance" label when not flagged
  owner-visible),
- `owner_stay_requests` (only the owner's own rows),
- `operation_tasks` flagged `owner_visible=true`,
- `maintenance_tickets` (severity + status; never the internal note),
- `guest_reviews` `owner_visible=true AND status='published'`,
- `owner_statements` issued/approved/paid,
- `guest_journey_events` `owner_visible=true` (sanitized).

Existing rows in the requested window are deleted before insertion so
re-runs never duplicate. The job runs nightly (`0 3 * * *`) over
`-90d / +120d`.

### 5. Privacy model
- Owners NEVER read raw `guest_journey_*`. They receive the projection
  through `owner_visible_events`. The migration installs internal-only
  RLS — there is no `owner_self_read` policy on any guest_journey table.
- Guest stay surfaces are the only place lock codes / Wi-Fi passwords /
  raw token strings appear, behind the existing v9G click-to-reveal
  audit gate. The runner never persists raw tokens — CTAs route
  through `/stay/[token]/...` paths emitted at render time.
- `events-pure.ts` provides `sanitizeJourneyEventForOwner` which strips
  any `email | phone | token | tokenHash | password | code | camera`
  shaped key from `metadataJson` and redacts email- and phone-shaped
  substrings from the description.

### 6. What is deferred
- WhatsApp / SMS / Telegram dispatch — the schema accepts those channel
  values but the queue defaults everything to `in_app` until provider
  + consent infrastructure ships.
- Multi-stage review reminders (`reminder_1`, `reminder_2`) — the column
  exists; the runner currently sends only the initial nudge.
- Any kind of AI write tool (e.g., generated copy per rule). Templates
  are deterministic.
- Per-villa rule overrides via `conditions_json` predicates beyond
  villa/project/channel scope.
- Smart-lock or OTA REST integrations.

## Consequences
- The journey runner is testable as a pure function chain. The only DB
  side-effect is `(insert, update)` on five tables; the suite asserts
  idempotency + dedupe behaviour without spinning up Postgres.
- Adding a new stage / anchor / suggestion type is a one-row change to
  `guest_journey_rules` plus (optionally) a new template key.
- The owner-visible projection now stops drifting: the nightly job
  recomputes from canonical sources, so any new write to bookings /
  blocks / statements / etc. propagates to owners in ≤24h.

## Roll-out
- Migration 0024 forward-only. Backfill is implicit: the seed adds 8
  demo rules, 3 sample suggestions, 3 events, and 2 review-request
  rows so the dev /stay/[token] page renders a non-empty
  "Recommended now" panel.
- Cron schedules wired in `src/features/jobs/definitions.ts` —
  `*/15 * * * *` for the rule runner, `0 10 * * *` for review
  requests, `0 3 * * *` for the owner-visible rebuild.
- Permission keys: `guest_journey.{read,write,run,manage}` and
  `review_request.{read,write}`. Investor roles are explicitly
  excluded from all six.
