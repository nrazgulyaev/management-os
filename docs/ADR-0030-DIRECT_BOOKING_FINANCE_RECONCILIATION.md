# ADR-0030 — Direct Booking Finance Reconciliation + Deposit Expiry (Prompt 107)

## Status
Accepted. Implemented in migration
`0029_direct_booking_finance_reconciliation.sql`, the
`src/features/direct-booking/finance-pure.ts`,
`src/features/direct-booking/finance-reconciliation.ts`, and
`src/features/direct-booking/deposit-expiry.ts` modules, the
`direct_booking_deposit_expiry` cron job at
`src/app/api/cron/direct-booking-deposit-expiry/route.ts`, the admin
surfaces at `/dashboard/direct-bookings/reconciliation*`, the public
status page rewrite at `/book/hold/[token]/status`, and the public-API
shape upgrades in `src/features/direct-booking/public-api.ts`.

## Context
Prompts 105 and 106 gave us:
- hold → guest request → manual concierge approval → canonical booking,
- a deposit gate with manual provider stub + director override.

After 106 we had two structural gaps:

1. **No finance bridge.** A booking_manager could mark a deposit paid
   and convert a request, but no `revenue_lines` row was ever
   produced — owner statements stayed blind to direct bookings.
2. **No deposit expiry.** Pending deposits sat indefinitely; the
   matching hold + request never released their dates back to
   inventory.

Prompt 107 closes both gaps without inviting any of the failure modes
we explicitly want to avoid:
- Real Stripe / Xendit / Wise / bank-rail integration.
- Real money movement or refunds.
- Duplicate revenue lines on retry.
- Posting into closed statement periods.
- Leaking provider / finance internals to guests.

## Decision

### 1. Schema additions

One new table — `direct_booking_finance_links` — plus four ALTER COLUMN
additions, all internal-only RLS (`is_internal_user()` gate, FORCE ROW
LEVEL SECURITY).

`direct_booking_finance_links` is the **idempotent bridge** between a
direct-booking request and the finance ledger:

| column | purpose |
|---|---|
| `id` | uuid PK |
| `request_id` | UNIQUE — a request can only ever produce one bridge |
| `booking_id` | partial UNIQUE — at most one live bridge per booking |
| `revenue_line_id` | partial UNIQUE — at most one live bridge per revenue line |
| `statement_period_id` | resolves the period at posting time, snapshotted |
| `code` | human-readable `DBFL-<request-suffix>` — for UI/audit |
| `status` | enum: `pending`, `posted`, `skipped_no_booking`, `skipped_locked_period`, `failed`, `reversed` |
| `total_minor` / `deposit_minor` / `balance_due_minor` | bigint snapshots in IDR minor |
| `posted_at` / `posted_by_user_id` | when + who posted |
| `reversed_at` / `reversed_by_user_id` / `reversal_reason` | reverse audit trail |
| `last_error` | failure reason on `failed` |

Three UNIQUE indexes guarantee idempotency:
- `direct_booking_finance_links_request_unique` on `(request_id)`
- `direct_booking_finance_links_booking_unique` on `(booking_id)` partial
  WHERE `status` IN (`pending`, `posted`)
- `direct_booking_finance_links_revenue_unique` on `(revenue_line_id)`
  partial WHERE `revenue_line_id IS NOT NULL`

CHECK constraints pin the status enum and forbid negative amounts.

ALTER COLUMN additions:
- `direct_booking_deposits.balance_due_minor` (BIGINT NOT NULL DEFAULT 0)
- `direct_booking_deposits.expires_reason` (TEXT NULL)
- `direct_booking_requests.finance_bridge_status` (TEXT NOT NULL DEFAULT
  `'pending'`)
- `direct_booking_requests.finance_link_id` (UUID NULL — soft FK to
  `direct_booking_finance_links.id`, FK enforced in SQL only to avoid
  circular Drizzle imports)

### 2. Pure helpers (`finance-pure.ts`)

All finance gating logic lives in a `server-only`-free module so it is
unit-testable without database fixtures:

- `calculateBalanceDue(total, deposit)` — clamps at `0n`, accepts
  bigint / number / string inputs.
- `shouldPostDirectBookingRevenue({ requestStatus, depositStatus,
  bookingId, conversionOverride })` — booleans-only branch table; only
  posts when (request converted) AND (booking exists) AND (deposit paid
  OR override).
- `isDepositExpired(deposit, now)` / `shouldExpireDeposit(deposit, now)`
  — wall-clock predicates.
- `publicDirectBookingStageSummary({ requestStatus, depositStatus,
  bookingStatus, guestClaimedPaid })` — collapses internal categories
  into ten guest-safe stages (`quote_held`, `request_submitted`,
  `team_review`, `deposit_requested`, `deposit_pending_verification`,
  `deposit_received`, `deposit_expired`, `booking_confirmed`,
  `request_rejected`, `request_expired`). `manually_marked_paid` is
  collapsed into `deposit_received` so the guest never sees the staff
  fast-track.
- `directBookingFinanceStatusLabel(status)` — admin-tone label for
  every enum value.
- `buildDirectBookingFinanceLinkCode(requestId)` — deterministic
  `DBFL-XXXXXXXX` formatter (uppercased, last 8 of UUID, no
  punctuation).

### 3. Revenue posting (`finance-reconciliation.ts`)

`postDirectBookingRevenue(requestId, actorUserId)` is the single entry
point for posting. Order of operations:

1. Load the request, its hold, deposit, and booking inside one query.
2. Refuse with a typed reason if `shouldPostDirectBookingRevenue`
   returns false — `not_converted`, `no_booking`, `deposit_unpaid`.
3. Resolve the statement period that contains the booking's
   check-in date.
4. Call `findLockingPeriod(periodId)` (re-used from the finance engine).
   If locked, upsert a `skipped_locked_period` finance link and exit
   without writing a revenue line.
5. Otherwise, INSERT a `revenue_lines` row with:
   - `source = 'direct_booking'`
   - `sourceReference = financeLinkId`
   - `revenueType = 'direct_booking_accommodation'`
   - `visibility = 'owner'` (so it surfaces in owner statements)
   - `amountMinor = total_minor`
6. UPSERT the finance link to `posted` (UNIQUE on `request_id`
   guarantees idempotency — a retry no-ops).
7. Mirror `finance_bridge_status = 'posted'` + `finance_link_id` on
   `direct_booking_requests`.
8. Audit log with `direct_booking.reconcile.post`.

`reverseDirectBookingFinanceLink(linkId, actorUserId, reason)` is the
inverse:
- Refuses if the underlying period is now locked.
- Marks the revenue_line `archivedAt = now`, never deletes (audit
  invariant).
- Flips the link to `reversed` with `reversal_reason` + `reversed_by`.
- Mirrors `finance_bridge_status = 'reversed'` on the request.

`reconcileDirectBookingsBatch(limit, actorUserId)` is the cron-friendly
batch posting wrapper used by the admin "Reconcile pending" button.

### 4. Deposit expiry (`deposit-expiry.ts`)

`expireUnpaidDeposits(now, limit)` selects deposits where
- `status IN ('pending', 'awaiting_provider')`
- `expires_at < now`

…and runs each through `expireDeposit(id, actorUserId)`:

1. Mark the deposit `expired` with `expires_reason = 'deadline_passed'`.
2. Cascade onto the linked request: any `submitted` / `under_review` /
   `approved` request flips to `expired`.
3. Cascade onto the linked hold: any `active` hold flips to `expired`
   AND its calendar block is released — dates go back to inventory.
4. Notify the finance_manager group.
5. Audit log with `direct_booking.deposit.expire`.

### 5. Cron + job

- `src/features/jobs/definitions.ts` — registers
  `direct_booking_deposit_expiry` with cron `*/5 * * * *`, jobType
  `booking_lifecycle`.
- `src/features/jobs/direct-booking-deposit-expiry-job.ts` — calls
  `expireUnpaidDeposits` and reports `expired` / `skipped` to the
  job runner.
- `src/app/api/cron/direct-booking-deposit-expiry/route.ts` — wraps
  `handleCronJobRequest(request, 'direct_booking_deposit_expiry')`,
  honouring the `CRON_SECRET` gate.

### 6. Admin reconciliation UI

- `/dashboard/direct-bookings/reconciliation` — hub with five
  metrics (`unposted`, `posted`, `skipped_locked`, `failed`,
  `total_balance_due`), filterable finance-link list, and a
  **Reconcile pending** button (server action calls
  `reconcileDirectBookingsBatch(50)`).
- `/dashboard/direct-bookings/reconciliation/[id]` — detail page
  with money summary, linked records (request / booking / revenue
  line / statement period), error display on `failed`, and a
  reverse form gated to `direct_booking.reconcile.reverse`.
- `/dashboard/direct-bookings/deposits` — added a **Balance due**
  column, an **Expires** column with an "Expired" badge, and an
  **Actions** column with `Expire now` for `pending` deposits
  (gated by `direct_booking.deposit.expire`).
- `/dashboard/direct-bookings/requests/[id]` — added a Finance
  Reconciliation panel showing the bridge status, balance due,
  finance link reference, and a **Post revenue now** button when
  the request is converted + paid but the bridge is still
  `pending`.
- `/dashboard/direct-bookings` — added three reconciliation metric
  cards and a **Reconciliation** hub link.

### 7. Guest status page rewrite

`/book/hold/[token]/status` is a now a clean, public-only timeline
driven entirely by `publicStage`:

- One `STAGE_HEADLINES` map turns each public stage into a guest-safe
  headline + body copy.
- A `buildTimeline` function produces a five-step `TimelineStep[]`
  with state (`complete` / `active` / `pending` / `warning`) so we
  never expose internal status flips.
- Money summary panel showing total / deposit / balance due in IDR
  with the public formatter.
- A "Notify us we paid" form when `canNotifyPaid` is true (deposit
  pending, hold active).

The page contains no provider session IDs, no finance link IDs, no
revenue line IDs, no statement period IDs, and never references
`manually_marked_paid` directly. A test grep enforces this.

### 8. Public API upgrade

`PublicHoldView` and `PublicDepositView` (`public-api.ts`) gained:

- `balanceDueMinor` + `balanceDueFormatted` — derived via
  `calculateBalanceDue` and `formatPublicMoney`.
- `publicStage` — a single string the status page renders against.
- `nextAction` — short copy describing what we are waiting on.
- `canNotifyPaid` — whether the guest-paid form should render
  (`PublicDepositView` only).

Internal IDs are explicitly absent from both interfaces.

### 9. Notifications

Four new templates, all seeded in `drizzle/seed.sql`:

- `direct_booking_deposit_expired_internal`
- `direct_booking_finance_posted`
- `direct_booking_finance_skipped_locked_period`
- `direct_booking_finance_reversed`

Each routes to a recipient group derived from existing role tiers:
finance_manager / accountant for accounting events; concierge for
deposit expiry. Templates include CTA links into the new admin
surfaces.

### 10. Permissions matrix additions

| key | super_admin | director | finance_manager | accountant | booking_manager | revenue_manager | property_manager | operations_manager | concierge | investor | field |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `direct_booking.reconcile.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `direct_booking.reconcile.write` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| `direct_booking.reconcile.reverse` | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — |
| `direct_booking.deposit.expire` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |

Reverse is intentionally tighter — only super_admin / director /
finance_manager.

### 11. Audit trail

Every state transition writes an audit event:
- `direct_booking.reconcile.post` (success), `direct_booking.reconcile.skip_locked`,
  `direct_booking.reconcile.skip_no_booking`, `direct_booking.reconcile.fail`
- `direct_booking.reconcile.reverse`
- `direct_booking.reconcile.batch` (one row per batch, payload includes
  `posted` / `skipped` / `failed` counters)
- `direct_booking.deposit.expire` (one row per expired deposit, payload
  includes `requestStatusBefore` + `holdStatusBefore`)

### 12. Tests

`tests/p107-direct-booking-reconciliation.test.ts` covers (13 tests):
- Migration shape — table identifier, RLS, status enum, three unique
  indexes, four ADD COLUMN clauses.
- `calculateBalanceDue` — clamping, mixed input types.
- `shouldPostDirectBookingRevenue` — full branch table including
  override.
- `shouldExpireDeposit` / `isDepositExpired` predicates.
- `publicDirectBookingStageSummary` — manually_marked_paid collapse,
  booking_confirmed precedence, guestClaimedPaid →
  deposit_pending_verification, internal-status leak detection.
- `directBookingFinanceStatusLabel` — every enum value labelled.
- `buildDirectBookingFinanceLinkCode` — determinism.
- Permissions matrix coverage by role.
- Cron route file existence + correct jobKey wiring.
- Notification template seed presence.
- Source greps:
  - No real Stripe / Xendit / Wise SDK imports anywhere in `src/`.
  - `PublicHoldView` / `PublicDepositView` do not expose
    `providerSessionId`, `financeLinkId`, `revenueLineId`,
    `statementPeriodId`.
  - Status page references no internal IDs and no
    `manually_marked_paid` literal.

## Consequences

### Positive
- Revenue lines now appear in owner statements for direct bookings.
- Finance bridge is fully idempotent — UNIQUE on `request_id` plus
  partial UNIQUEs on `booking_id` and `revenue_line_id` mean retries,
  cron sweeps, and manual posts all converge to the same row.
- Locked statement periods are honoured automatically — no posting
  into closed months.
- Pending deposits no longer sit forever; the cron sweep releases
  inventory back into the calendar.
- The guest status page is now a clean public timeline that never
  leaks staff vocabulary.

### Negative / risks
- The `revenue_lines.archivedAt = now` reversal pattern preserves
  audit trail but means owner statements need to filter on
  `archivedAt IS NULL` everywhere — already the case but worth
  watching as we add new statement queries.
- A future provider integration (Prompt 11x?) will have to be careful
  not to break the public-API contract — the test grep is our
  guardrail.

### Out of scope (deferred)
- Real PSP integration (still stub-only).
- Refund flow back through the finance ledger.
- Per-property statement period overrides for direct bookings.
- Owner-facing direct booking detail in the owner portal (revenue
  lines surface but no per-booking drill-in yet).

## Recommended next prompt
Prompt 108 — direct booking owner portal surface: expose direct
bookings in the owner portal stays/calendar/statements with
guest-safe redaction (no guest contact info), reusing the
`PublicStageKey` taxonomy for state copy.
