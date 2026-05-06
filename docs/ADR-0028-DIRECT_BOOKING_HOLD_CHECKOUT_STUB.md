# ADR-0028 — Direct Booking Hold & Checkout Stub (Prompt 105)

## Status
Accepted. Implemented in migration `0027_direct_booking_hold_checkout_stub.sql`,
the `src/features/direct-booking/*` module, the public API at
`/api/v1/holds*`, the public booking UI at `/book/hold/[token]*`, and
the admin surface at `/dashboard/direct-bookings/*`.

## Context
The dynamic-pricing engine (Prompt 104) gave us a deterministic public
quote. What it lacked was a path from "I quoted these dates" to "the
inventory is reserved while I collect contact details" — without
introducing a Payment Service Provider (PSP) or any commitment to
process money.

We need:
- a temporary hold that locks the dates against other quotes,
- a guest-side form for contact / stay details,
- a manual concierge approval step,
- a conversion path to the canonical `bookings` row,
- an automatic expiry job for abandoned holds.

We want NONE of:
- payment processing (Stripe / Xendit / Wise / crypto),
- card-data collection,
- automatic confirmation,
- exposure of internal pricing rules to the public,
- exposure of guest contact details to owners.

## Decision

### 1. Hold lifecycle
- **active**: created by the public quote endpoint; calendar block
  installed; TTL = 15 minutes.
- **converted**: manually moved to a confirmed `bookings` row.
- **expired**: TTL elapsed; cron job releases the calendar block.
- **cancelled**: guest abandoned the flow OR an admin released it.
- **rejected**: concierge declined the linked request.

The hold is the source of truth for the *quote snapshot*. Once
created, the snapshot is never recomputed — the request that's
ultimately converted carries the price the guest agreed to, even if
dynamic pricing shifts in the meantime.

### 2. Quote snapshot immutability
`buildHoldSnapshotFromQuote` writes a JSONB blob with: `available`,
`reason`, `nights`, `currency`, `channelKey`, per-night rates, and
`capturedAt`. It NEVER persists `ruleSetId` or any internal modifier
breakdown — the snapshot is what the public would have seen. Tests
pin this contract.

### 3. Availability block integration
We reuse the existing `villa_calendar_blocks` primitive:
- `block_type = 'internal_hold'`
- `source_type = 'direct_booking_hold'`
- `source_id = direct_booking_holds.id`
- `owner_visible = false`, `guest_visible = false`

Idempotent: `createInternalHoldBlockForDirectHold` looks up by
`(source_type, source_id)` and updates instead of duplicating.
Release sets `status = 'released'` (we never hard-delete — audit
trail).

### 4. Manual approval model
The flow is deliberately concierge-mediated:

1. Guest submits the form → `direct_booking_requests.status =
   submitted`.
2. Concierge picks it up → `under_review`.
3. Concierge approves → `approved`. Optional decision note.
4. Booking manager (separate permission tier) converts → canonical
   `bookings` row created with `status = confirmed | tentative` (the
   final status is admin-chosen; default is `tentative`). Holds and
   requests both move to `converted`. Calendar block flips from
   `internal_hold` to a fresh `guest_booking` block via the existing
   `syncBookingCalendarBlock`.
5. The new booking triggers `runBookingAutomationForBooking`, which
   wires arrival inspection + checkout cleaning automatically.

If the concierge rejects, the linked hold goes to `rejected` and the
calendar block is released. The hold was always a request — no
confirmation was ever promised.

### 5. Expiry job
`direct_booking_hold_expiry` runs every 5 minutes. It walks active
holds where `expires_at < now AND converted_booking_id IS NULL`,
marks them `expired`, releases the calendar block, and expires linked
submitted/under_review requests as `expired`. Each run writes a
`direct_booking_expiry_runs` row with metrics. Cron endpoint:
`/api/cron/direct-booking-expiry` (auth via `CRON_SECRET`).

### 6. Security & anti-abuse
- The raw token is returned to the guest exactly once (via the
  `POST /api/v1/holds` response body) and is never persisted; only
  the SHA-256 hash + 8-char prefix are stored.
- IP and user-agent are stored as 16-char salted SHA-256 hashes only.
- Rate-limit: 5 holds per IP per 10-minute window; if exceeded, IP
  is blocked for 30 minutes. Counters live in
  `direct_booking_hold_rate_limits` (UNIQUE on `(ip_hash,
  window_start)`). The decision logic is a pure helper
  (`decideRateLimit`) so tests can verify boundary behaviour.
- Public reasons collapse internal categories — guests never see
  `owner_stay`, `internal_hold`, `min_los`, or `stop_sell` strings
  outside the documented set.
- All five new tables `FORCE` RLS, internal-only policies. The public
  API runs through the service-role connection, never exposes
  PostgREST.
- `bookings.guestEmail` / `guestPhone` are still owner-blind — the
  conversion flow stores them on `direct_booking_requests`, never
  surfaces them to owner routes.

### 7. Permissions
Five new keys: `direct_booking.{read,write,approve,convert,manage}`.
Convert + manage are reserved for `super_admin / director /
booking_manager`. Concierge can read/write but not approve or
convert. Investor + all field roles excluded.

### 8. Future PSP integration (deferred)
Prompt 106 will add a payment-provider stub + deposit workflow on
top of this. Notes for that:
- The hold table already has a `quote_snapshot_json` to lock pricing.
- A future `direct_booking_deposits` table would attach to a
  `direct_booking_request` and capture the provider's session id.
- The `confirmed` final status will be gated on a successful deposit
  capture; until then we'll keep using `tentative`.
- The expiry job will need to also expire deposit-pending requests
  when the PSP session times out.

## Consequences
- The hold + request lifecycle is testable as pure functions for
  predicates / snapshots / rate-limit decisions; the integration
  with bookings / availability is exercised through a small set of
  source-grep + permission tests.
- Adding a real PSP only requires a new module + a status gate; the
  rest of the lifecycle stays.
- The villa availability merger (Prompt 104) already counts
  `internal_hold` blocks against availability, so direct-booking
  holds correctly block other quotes immediately.

## Roll-out
- Migration `0027` is forward-only.
- Seed adds 7 notification templates, 2 active holds + 1 expired,
  3 requests across statuses, and event timelines.
- Permissions update is additive — existing roles unchanged.
- Cron job runs every 5 minutes; route is wired into the existing
  `handleCronJobRequest` envelope and respects `CRON_SECRET`.
