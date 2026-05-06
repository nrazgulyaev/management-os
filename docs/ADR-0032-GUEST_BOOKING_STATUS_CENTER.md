# ADR-0032 — Guest Booking Status Center + Notifications (Prompt 109)

## Status
Accepted. Implemented in migration
`0031_guest_booking_notifications_status_center.sql`, the
`src/features/direct-booking/guest-status-*.ts` modules, the public
status center rewrite at `/book/hold/[token]/status`, the new
`/book/hold/[token]/messages` page, three public API endpoints, the
admin surfaces under `/dashboard/direct-bookings/guest-status[/id]`
and `/dashboard/direct-bookings/messages[/threadId]`, and lifecycle
hooks wired into every direct-booking action that changes the chain
state.

## Context
Prompts 105-108 produced a complete direct-booking pipeline (hold →
request → deposit → conversion → finance reconciliation → owner
projection), but the guest-facing surface stayed thin: the
`/book/hold/[token]/status` page rendered a one-line stage badge and
a money summary, with no:
- explicit notification log,
- way to message the concierge,
- premium copy for each lifecycle step,
- snapshot the API could return without recomputing on every read.

We also needed a clear redaction contract.  The canonical chain
carries guest emails, phones, hold token hashes, payment provider
session IDs, finance link IDs, revenue line IDs, statement period
IDs, internal admin notes, and rejection reasons — none of which can
ever reach a guest.

Hard rules for Prompt 109:
- No real Stripe / Xendit / Wise integration. No card collection.
- No public RLS policies on the new tables — guests reach them
  through token-bound server actions / API routes.
- Public response shapes must be stable and redacted.
- Existing demo flows must continue working.

## Decision

### 1. Four new tables

`direct_booking_guest_notifications` — append-only public-safe log:
| column | purpose |
|---|---|
| `hold_id` / `request_id` / `deposit_id` / `booking_id` | optional anchors |
| `notification_key` | enum-like (`request_received`, `request_under_review`, `deposit_requested`, `guest_claimed_paid`, `deposit_marked_paid`, `deposit_failed`, `request_approved`, `booking_confirmed`, `request_rejected`, `hold_expired`, `deposit_expired`, `request_cancelled`, `concierge_message`) |
| `public_title` / `public_body` | the only thing the guest sees |
| `public_action_label` / `public_action_href` | optional CTA |
| `severity` | `info` / `success` / `warning` / `critical` |
| `status` | `unread` / `read` / `archived` |
| `dedupe_key` | UNIQUE — every transition is idempotent |
| `visible_from` / `read_at` / `archived_at` / `created_at` | timestamps |

`direct_booking_guest_status_snapshots` — denormalised public stage
view (one per hold; UNIQUE on `hold_id`).  Carries the public_stage
enum, headline, body, next_action, money fields, villa label, and
date range.  CHECK constraint pins the fourteen-stage taxonomy.

`direct_booking_guest_message_threads` — thread metadata (status =
`open`/`closed`/`archived`, unread counters per side, last-message
timestamps).  Partial UNIQUE on `request_id` so a request can ever
have only one thread.

`direct_booking_guest_messages` — append-only thread messages with
both raw `body` (staff audit) and `body_redacted` (the only thing
guests render).  `author_type` ∈ `guest`/`staff`/`system`,
`visibility` ∈ `guest_visible`/`internal_only` (so staff can leave
internal notes inline with the thread).

All four tables are RLS-forced internal-only (`is_internal_user()`
gate for both read and write).  **No public RLS** — guests reach
these tables only through token-bound server actions.

### 2. Public stage taxonomy

The fourteen-stage public taxonomy lives in
[`guest-status-pure.ts`](../src/features/direct-booking/guest-status-pure.ts):

`quote_held` → `request_submitted` → `under_review` →
`deposit_required` → `deposit_pending_confirmation` →
`deposit_confirmed` → `approved` → `confirmed` → `in_house` →
`completed`, with three terminal off-ramps (`expired`, `cancelled`,
`rejected`) and one critical off-ramp (`failed`).

`buildPublicDirectBookingStage` collapses `(hold, request, deposit,
booking)` into one of these stages.  Rules:
- Booking-side terminal/active wins.
- Cancelled/rejected terminal categories beat pending categories.
- `paid` / `manually_marked_paid` deposit → `deposit_confirmed`.
- Guest-claimed-paid deposit (still pending) →
  `deposit_pending_confirmation`.
- Approved request + unpaid deposit → `deposit_required`.
- `failed` deposit → `failed` (critical severity).

### 3. Guest notification design

Notifications are produced by `buildNotificationForStageTransition`
— a pure function that takes (prevStage, nextStage, anchorRefs) and
returns either `null` (no-op) or a `QueuedNotification` with a
deterministic `dedupeKey` (`dbg:<key>:<anchor>`).  The UNIQUE on
`dedupe_key` makes every transition idempotent: a retried lifecycle
action is a no-op insert.

Why a separate table from `notification_queue`?  Two reasons:
- **Redaction surface**.  The internal `notification_queue` carries
  arbitrary JSON `payload` for staff routing.  The guest-facing log
  must be a fixed shape with `public_title` / `public_body` — no
  payload, no provider IDs, no internal vocabulary.
- **Token scoping**.  Guests retrieve notifications by hold token,
  not by recipient role.  Joining through `notification_queue` would
  require either a public RLS policy (deferred) or a token-bound
  service join (redundant with this table).

### 4. Guest message thread design

One thread per request (UNIQUE), or one per hold when no request
exists yet.  Messages carry both raw and redacted bodies; the
public surface only ever renders `body_redacted`.

`redactGuestMessage` strips:
- emails,
- international phone numbers,
- 6-digit access codes,
- ≥ 24-char base64-ish / hex-ish blobs (likely tokens / hashes),
- `password is …` / `pin is …` phrases,
- provider IDs (`ses_xxx`, `pi_xxx`, `man_xxx`, etc.),
- webhook IDs (`wh_xxx`).

`guestCanMessage` gates the composer: terminal stages (`expired`,
`cancelled`, `rejected`, `completed`) and `failed` disable the
form.

Rate limit: 5 guest messages per token per hour, enforced at the
service layer with a `COUNT(*)` over the last hour.

### 5. Public status center changes

`/book/hold/[token]/status` was rewritten to render five panels:

1. **Hero** — public stage badge, headline, body, optional CTA, and
   hold/deposit expiry copy when relevant.
2. **Reservation summary** — villa, dates, nights, guests, total,
   deposit, balance due.
3. **Timeline** — seven steps (`Hold ready` → `Request received` →
   `Under review` → `Deposit requested` → `Payment claimed` →
   `Deposit confirmed` → `Booking confirmed`) with `complete` /
   `active` / `pending` / `warning` states.
4. **Notifications** — every guest-visible notification with title,
   body, severity badge, and optional action.
5. **Concierge messaging** — preview of the latest message + a
   composer (or a disabled state when terminal).

`/book/hold/[token]/messages` is an optional dedicated thread page;
opening it marks the guest side as read.

### 6. Public API endpoints

- `GET /api/v1/holds/[token]/status` — returns
  `{ snapshot, notifications, messagePreview, timeline }`.  Rebuilds
  the snapshot on read (best-effort) so the public page never lags.
  No internal IDs.
- `POST /api/v1/holds/[token]/notifications/[notificationId]/read` —
  flip a notification to `read`.
- `GET /api/v1/holds/[token]/messages` — list redacted messages.
- `POST /api/v1/holds/[token]/messages` — guest reply, zod-validated,
  rate-limited (5/token/hr), redacted server-side.  `429 Retry-After`
  on rate limit, `409` on terminal/closed thread, `400` on invalid
  input.

All four routes set `Cache-Control: no-store` and use a 405-with-
`Allow` guard for non-supported HTTP methods.

### 7. Admin routes

- `/dashboard/direct-bookings/guest-status` — list of every snapshot
  with stage tone badges + counts.
- `/dashboard/direct-bookings/guest-status/[id]` — admin detail
  with internal source trace card (hold/request/deposit/booking IDs)
  + rebuild button + manual-notification queue form.
- `/dashboard/direct-bookings/messages` — unified inbox
  (open/closed/archived filter).
- `/dashboard/direct-bookings/messages/[threadId]` — full thread
  view with reply form (guest-visible / internal-only toggle), close
  / archive / reopen buttons, and a "Show original" details
  disclosure for the staff audit trail.
- `/dashboard/direct-bookings/requests/[id]` (existing) gained a
  **Guest status** panel with public stage, last guest update, staff
  unread count, and links to the snapshot + thread.

### 8. Lifecycle hooks

`syncGuestStatusForChain` is the single fan-in helper.  It accepts
any of `holdId` / `requestId` / `depositId` / `bookingId`, resolves
to the holdId, rebuilds the snapshot, computes the (prevStage,
nextStage) delta, and queues the right notification (or nothing).
Best-effort — failures are caught and logged so the caller's primary
action never fails.

Wired into:
- `actions.ts`: `markDirectBookingUnderReviewAction`,
  `approveDirectBookingRequestAction`,
  `rejectDirectBookingRequestAction`,
  `convertDirectBookingRequestToBookingAction`.
- `deposit-actions.ts`: `markDepositManuallyPaidAction`,
  `markDepositFailedAction`, `cancelDepositAction`.
- `expiry.ts`: hold expiry sweep.
- `deposit-expiry.ts`: deposit expiry sweep.
- `public-api.ts`: hold creation, request submission, guest-paid
  notify, guest-cancel.

### 9. Permissions matrix additions

| key | super_admin | director | operations_manager | property_manager | booking_manager | concierge | finance_manager | accountant | investor / field |
|---|---|---|---|---|---|---|---|---|---|
| `direct_booking.guest_notifications.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `direct_booking.guest_notifications.write` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `direct_booking.guest_messages.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `direct_booking.guest_messages.write` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `direct_booking.guest_messages.manage` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |

### 10. Tests

[`tests/p109-guest-booking-status-notifications.test.ts`](../tests/p109-guest-booking-status-notifications.test.ts)
covers (16 tests):
- Migration shape (4 tables, RLS, CHECK enums for
  severity/status/stage/author/visibility, dedupe UNIQUE, no public
  RLS policy).
- Pure stage derivation (every primary state + terminal-overrides-
  pending).
- Copy: every stage produces non-empty headline + body, and none
  contain `manual_stub`, `providerSession`, `depositId`,
  `financeLink`, `webhook`, `manually_marked_paid`, etc.
- Sanitisation: `sanitizeGuestNotificationPayload` drops every
  banned key.
- Stage transition → notification mapping + dedupe key shape.
- Message redaction: emails / phones / 6-digit codes / long tokens
  / password phrases / provider IDs / webhook IDs.
- `guestCanMessage` gating for terminal/failed states.
- `buildMessagePreview` returns guest-safe shape with correct
  counts.
- Permissions matrix coverage by role.
- Source greps:
  - public hold pages contain no `providerSessionId` / `holdTokenHash`
    / `financeLinkId` / `revenueLineId` / `statementPeriodId` /
    `webhookPayload` / `configPrivateEncrypted`.
  - public status API does not return raw `deposit_id` / `request_id`
    keys.
  - status page contains no `stripe` / `xendit` / `cvv` /
    `card number` / `publishableKey` copy.
  - guest message composer is `"use client"` and does not import
    server-only modules.
- Notification template seed presence (10 keys).
- Lifecycle wiring: `syncGuestStatusForChain` is called in the
  expected six files at ≥ 4 call-sites in `actions.ts`.

## Consequences

### Positive
- Guests now see a clean fourteen-stage timeline + premium copy at
  every step.
- Notifications are queued idempotently; retried lifecycle actions
  are safe.
- The redaction contract is enforced once, in two pure modules
  (`guest-status-pure.ts`, `guest-messages-pure.ts`), and source-grep
  tests prevent regressions.
- The status snapshot is denormalised, so the public API serves a
  single small row; rebuild-on-read keeps it fresh.
- A simple guest ↔ concierge thread is now available without
  routing through the AI handoff system.

### Negative / risks
- The snapshot is rebuilt on every public read.  This is fine at
  current scale (one query per status load) but should move behind
  a cache or only-rebuild-when-stale gate if traffic grows.
- The thread message composer redacts before persisting, but the
  raw `body` is still stored for staff audit.  Staff must be aware
  not to paste the raw body into a guest-visible reply.
- Rate limiting is per token, not per IP — a determined client
  rotating tokens could still spam.  IP-based rate limit is deferred.
- No real email / SMS delivery yet; notifications are in-app /
  status-center visible only.  Existing `notification_templates`
  rows are seeded so a future email queue can pick them up without
  a schema change.

### Out of scope (deferred)
- Real PSP integration (still stub-only).
- Email / SMS delivery for guest notifications.
- Per-IP rate limit on message creation.
- Thread attachments (current schema is text-only).
- Web push / SSE on the public status page (full reload only).

## Recommended next prompt
Prompt 110 — Finance & Statement Transparency Final Polish: unify
direct booking revenue, guest services, owner stays, fulfilment
costs, utilities, reserves, and maintenance charges inside owner
statements with owner-safe grouping, explanation cards, reconciliation
warnings, and admin traceability.  Keep raw finance IDs hidden from
owners, preserve statement accounting semantics, and add demo data
coverage for every statement source.
