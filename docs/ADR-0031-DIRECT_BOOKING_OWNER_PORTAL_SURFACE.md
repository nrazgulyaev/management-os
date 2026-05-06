# ADR-0031 — Direct Booking Owner Portal Surface + Owner Revenue Transparency (Prompt 108)

## Status
Accepted. Implemented in migration `0030_direct_booking_owner_portal.sql`,
the `src/features/owner-bookings/*` modules, the
`owner_booking_projection_rebuild` cron job at
`src/app/api/cron/owner-booking-projection-rebuild/route.ts`, three new
owner-portal routes (`/owner/bookings`, `/owner/bookings/[id]`,
`/owner/revenue`), three new admin routes
(`/dashboard/owner-intelligence/bookings[/id]`,
`/dashboard/owner-intelligence/revenue`), and a polish to
`/components/finance/statement-detail.tsx` that groups statement lines
by source.

## Context
Prompts 105–107 gave us the full direct-booking pipeline (hold →
request → manual concierge approval → deposit gate → revenue posting).
After Prompt 107, direct-booking revenue lines reach owner statements
via the existing `revenue_lines` → `statement_lines` flow.

Two structural gaps remained:

1. **Owners couldn't see direct bookings on their calendar.** The
   `owner_visible_events` projection from Prompt 101 covered bookings,
   owner stays, maintenance, and reviews — but not direct-booking
   requests, holds, or deposits. A guest who reserved through
   `/book/hold/<token>` was invisible to the owner until conversion.
2. **Owners couldn't compare direct vs OTA revenue.** The owner
   statement showed total revenue but not the source mix; investors
   asking "are direct bookings actually growing?" had no answer.

We also needed to pin down a redaction contract. The direct-booking
flow carries guest emails, phones, hold token hashes, payment provider
session IDs, finance link IDs, revenue line IDs, and statement period
IDs — none of which should ever reach an owner.

Hard rules for Prompt 108:
- Owners read **owner-safe projections only**, never the raw
  direct-booking / payment / finance tables.
- Owner statements are still the canonical record for revenue;
  projection tables are illustrative.
- No real PSP integration. No money movement. No new finance
  semantics.

## Decision

### 1. Three new projection tables

`drizzle/0030_direct_booking_owner_portal.sql` introduces:

| table | purpose |
|---|---|
| `owner_booking_summaries` | One owner-safe row per booking / unconverted direct request / owner stay / maintenance block. Carries `source_type`, `public_status`, `owner_label`, masked `guest_label`, dates, amounts, statement linkage. |
| `owner_booking_revenue_breakdowns` | Owner-safe per-summary line items (`accommodation`, `cleaning_fee`, `service_revenue`, `taxes`, `ota_fee`, `payment_fee`, `management_fee`, `reserve`, `owner_payout_effect`, `other`). |
| `owner_revenue_source_monthly` | Pre-computed (owner, villa, project, month, source, currency) bucket. `source_type` ∈ `direct_booking` / `ota` / `owner_stay` / `service_upsell` / `manual` / `other`. |

All three tables:
- ENABLE + FORCE ROW LEVEL SECURITY.
- `internal_read` + `internal_write` policies via `public.is_internal_user()`.
- `owner_self_read` policy:
  `owner_visible = true AND owner_id IN (SELECT public.current_owner_ids())`.
- No owner write policies — every mutation flows through internal
  services.

Idempotency:
- `owner_booking_summaries` — partial UNIQUEs on
  `(owner_id, booking_id)` and `(owner_id, direct_booking_request_id)`.
- `owner_revenue_source_monthly` — UNIQUE on
  `(owner_id, COALESCE(villa_id, '000…'), COALESCE(project_id, '000…'), period_month, source_type, currency)`.

CHECK constraints pin the source_type / public_status / category /
direction enums.

### 2. Pure helpers

`src/features/owner-bookings/calendar-pure.ts` — no DB / no `server-only`:
- `maskOwnerGuestName(fullName)` — first token + last initial; null →
  "Guest".
- `mapBookingChannelToSourceType({channelKey, channelType, hasDirectBookingRequest})`
  — owner-facing source. Direct request flag wins over channel key.
- `publicBookingStatus(input)` — collapses booking / request / deposit
  / hold / owner-stay statuses into the eleven owner-facing values.
- `publicStatusLabel(status)` — friendly badge text.
- `publicBookingSourceLabel(sourceType, channelLabel)` — source label.
- `buildOwnerLabel(sourceType, status, channelLabel)` —
  e.g. `"Direct booking · Confirmed"`, `"Airbnb stay · Guest in-house"`.
- `isOwnerVisibleBookingStatus(status, hasBlockingHold)` — the
  visibility predicate.
- `calculateBookingNights`, `monthKey` — date math.
- `safeOwnerBookingProjection(input)` — drops 28+ banned keys
  including `guestEmail`, `guestPhone`, `holdTokenHash`,
  `providerSessionId`, `financeLinkId`, `revenueLineId`,
  `statementPeriodId`, `decisionNote`, `internalNotes`,
  `configPrivateEncrypted`.
- `buildOwnerBookingTimelineStatus(summary)` — public-tone headline +
  body for the booking detail page.

`src/features/owner-bookings/revenue-pure.ts`:
- `ownerSourceTypeToBucket(s)` — maps detailed source types into the
  six monthly buckets (Airbnb / Booking.com / Vrbo all collapse to `ota`).
- `revenueSourceBucketLabel(b)` — owner-facing label.
- `buildRevenueSourceMonthlyBuckets(rows)` — deterministic aggregation.
- `summarizeOwnerRevenueSourceMix(rows, currency)` — single-currency
  source mix card list with `averageRevenuePerNightMinor`.
- `totalNetOwnerEffectMinor(rows, currency)`.
- `formatOwnerRevenueExplanation(summary, breakdowns)` — 1-3 sentence
  explanation: posted to statement vs posted/no-statement vs
  pre-confirmation vs cancelled vs owner stay vs blocked.

`src/features/owner-bookings/statement-source-groups.ts`:
- `classifyStatementLine(line)` — buckets each statement line by
  `source_table` / `category` keywords.
- `groupStatementLinesBySource(lines)` — produces
  `direct_booking` → `ota` → `guest_services` → `owner_stay` →
  `maintenance_reserve` → `tax_fee` → `other` ordered buckets.
- `statementSourceCopyContainsNoSourceIds(copy)` — runtime guard for
  the test grep.

### 3. Projection rebuild

`src/features/owner-bookings/projection.ts` — server-only:
- `defaultRebuildWindow(today)` — `[today − 90d, today + 365d]`.
- `rebuildOwnerBookingSummariesForAllOwners(window)` —
  fan-out across every active owner.
- `rebuildOwnerBookingSummariesForOwner(ownerId, window)` —
  wipes and reinserts in the window so retries converge to the same
  rows. Sources merged: `bookings` (with channel + guest joins),
  unconverted `direct_booking_requests` (with hold), `owner_stay_requests`,
  `villa_calendar_blocks` where `owner_visible = true`. Per-row
  revenue linkage is loaded via `revenue_lines` + `statement_lines`
  matched on `(source_table='revenue_lines', source_id)`.
- `rebuildOwnerBookingSummaryForBooking(bookingId)` /
  `rebuildOwnerBookingSummaryForDirectRequest(requestId)` —
  per-row triggers.
- `rebuildOwnerRevenueSourceMonthlyForOwner(ownerId, window)` —
  reads back the projection summaries and aggregates them through
  `buildRevenueSourceMonthlyBuckets`.

### 4. Server actions

`src/features/owner-bookings/actions.ts` — four zod-validated,
permission-gated actions:
- `rebuildOwnerBookingSummariesAction()` —
  `owner_booking.manage`.
- `rebuildOwnerBookingSummaryForBookingAction()` —
  `owner_booking.manage`.
- `rebuildOwnerBookingSummaryForDirectRequestAction()` —
  `owner_booking.manage`.
- `rebuildOwnerRevenueSourceMonthlyAction()` —
  `owner_revenue.manage`.

All audit-log via `recordAuditEvent` and revalidate the relevant
admin + owner paths.

### 5. Cron + job

- `src/features/jobs/owner-booking-projection-rebuild-job.ts` —
  runner.
- `src/features/jobs/definitions.ts` — registered with cron `0 4 * * *`,
  jobType `owner_intelligence`, timeout 300s.
- `src/features/jobs/actions.ts` — wired into `KNOWN_JOBS`,
  `JobKey`, `executeJob`, `executeAllJobs`.
- `src/app/api/cron/owner-booking-projection-rebuild/route.ts` — wraps
  `handleCronJobRequest(request, "owner_booking_projection_rebuild")`.

### 6. Owner portal routes

- `/owner/bookings` (new) — filterable table with source / status /
  villa filters; per-row revenue cell shows posted (with statement
  link) / posted-pending-statement / estimated.
- `/owner/bookings/[id]` (new) — owner-safe booking detail with
  timeline headline, KV grid (no email / phone / token), revenue
  breakdown, statement link when issued/approved/paid.
- `/owner/calendar` (upgraded) — added a Direct bookings panel above
  the canonical calendar rows + a legend with `Direct booking` /
  `OTA stay` / `Owner stay` / `Maintenance` / `Internal hold`
  badges.
- `/owner/villas/[id]/calendar` (upgraded) — added a per-villa Direct
  bookings panel.
- `/owner/revenue` (new) — top-level metrics, source-mix cards,
  per-month bucket table.
- `/owner/villas/[id]/revenue` (new) — per-villa source mix.

### 7. Admin owner-intelligence routes

- `/dashboard/owner-intelligence/bookings` (new) — projection table
  with rebuild buttons per row + a top-level Rebuild-all button.
- `/dashboard/owner-intelligence/bookings/[id]` (new) — owner-safe
  projection card + internal source trace card (booking / request /
  hold / statement IDs visible to internal users only) + breakdown
  list with internal-only flag indicator.
- `/dashboard/owner-intelligence/revenue` (new) — owner revenue
  source mix with rebuild button.
- `/dashboard/direct-bookings/reconciliation` — added a footnote
  pointing to `/dashboard/owner-intelligence/bookings`.

### 8. Owner statement detail polish

`src/components/finance/statement-detail.tsx` — added a
**Revenue source explanation** section between the body and the
plain-language explanation. Uses `groupStatementLinesBySource` to
bucket lines into Direct booking / OTA / Guest services / Owner stay /
Maintenance reserves / Taxes / Other. Each bucket shows label +
description + currency-aware total. **No source IDs are ever
rendered** — a source-grep test enforces this.

### 9. Permissions matrix additions

| key | super_admin | director | finance_manager | accountant | operations_manager | property_manager | booking_manager | revenue_manager | investor_owner | investor_viewer | concierge | field |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `owner_booking.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `owner_booking.manage` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `owner_revenue.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `owner_revenue.manage` | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | — | — | — | — |

Investor + investor_owner roles get owner-side reads only — never
manage. Concierge / housekeeper / technician / field excluded.

### 10. Seed data

Six demo `owner_booking_summaries` rows, six
`owner_booking_revenue_breakdowns` rows, and four
`owner_revenue_source_monthly` rows under owner Emma Whitmore — all
guarded by `IF NOT EXISTS (SELECT 1 FROM information_schema.tables …)`
so the seed no-ops in environments where the projection migration has
not been applied. No real PII — guest labels are `"Emma W."` /
`"Daniel K."` / `"Sofia M."` only.

## Consequences

### Positive
- Owners now see direct bookings on their calendar with a distinct
  badge — no need to wait for statement issuance to know a guest
  reserved.
- Owners can compare direct vs OTA at a glance (source mix cards on
  `/owner/revenue`).
- Statement detail now groups lines by source so the "did this come
  from a direct booking?" question has a one-click answer.
- The redaction contract is enforced once, in
  `src/features/owner-bookings/calendar-pure.ts`, and source-grep tests
  prevent regressions.

### Negative / risks
- The projection is a derived view, not a system of record — owners
  could see slightly stale numbers between a booking change and the
  next nightly rebuild. The per-booking rebuild action mitigates this
  for high-touch flows; the projection rows carry `source_updated_at`
  so the admin detail page can flag staleness.
- Currency conversion is not applied; if owners hold mixed-currency
  shares, the source mix is shown per-currency. Documented inline on
  the page.
- `owner_revenue_source_monthly` is rebuilt per-owner from the
  projection summaries (not directly from `revenue_lines`). If
  the projection itself is wrong, the bucket aggregates inherit the
  bug — but the projection is the single redaction seam, so this is
  an intentional trade-off.

### Out of scope (deferred)
- Real FX conversion in the owner-revenue view.
- Per-villa drill-in inside owner statements (the current statement
  PDF stays unchanged).
- ML-driven booking anomaly detection on the projection.
- Owner-stay financial bridge to revenue / fee lines (Prompt 9C
  groundwork; not extended here).

## Recommended next prompt
Prompt 109 — Guest Booking Notifications + Guest Status Center Polish:
wire direct booking status changes (request received → under review
→ deposit requested → deposit claimed paid → approved → converted →
expired / cancelled) into guest-facing notifications and tighten the
hold/status pages without leaking internal IDs or payment provider
internals.
