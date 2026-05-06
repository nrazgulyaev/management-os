# ADR-0014 — Owner Stay Finance Bridge, Notifications & Public Quote API (v9C)

Status: Accepted · 2026-04-27

## Context

V9B shipped the owner-stay request lifecycle and persisted the financial
estimate snapshot on `owner_stay_requests` — but the snapshot did not
flow into actual finance rows. V9C closes that loop:

- A **finance bridge** that materialises owner-stay charges into
  `management_fee_lines` (compensation) and `expense_lines` (operational
  cost) when the stay is approved or completed.
- **Owner-stay notifications** wired into the existing v8B queue/inbox
  so owners hear about request → approval → completion transitions
  without admin chase emails.
- A **public quote API** at `GET /api/v1/quote` so the future
  direct-booking surface can reach the v9B `quoteForRange` engine
  without auth.

Hard guardrails (re-stated):

- No bank reconciliation, no payments, no PriceLabs.
- Owner stays are NOT counted as rental revenue.
- Owners never read raw bridge rows or rate-plan internals.
- Approval/completion is admin-driven; no auto-charging.

## Decisions

### 1. Finance row mapping

Two finance tables are written to:

| Owner-stay amount | Finance row | Why |
|---|---|---|
| `estimated_management_compensation_minor` | `management_fee_lines` | Compensation owed because the villa was used by the owner instead of generating rental revenue. Keeps owner-stay charges OUT of `revenue_lines` (hard product constraint). |
| `estimated_operational_cost_minor` | `expense_lines` (`expense_type='owner_stay_operational_cost'`, `allocation_scope='owner_direct'`, `owner_chargeable=true`) | Cleaning / utilities the owner pays directly. `owner_direct` scope keeps the cost from being pool-allocated. |

`compensation_revenue_line_id` exists on `owner_stay_finance_links` as a
nullable FK so a future variant where compensation does flow through
revenue can plug in without a schema change. **v9C never writes to
`revenue_lines`.**

### 2. Effective date for finance rows

Both rows are dated `requested_end - 1 day` (last night of the stay).
This matches the convention used by the v8 material-usage finance
bridge (ADR-0008) and ensures the charge lands in the period the stay
actually finishes in.

### 3. Locked-period behaviour

The DB-level `fn_prevent_locked_period_mutation` trigger (introduced in
0002 / refined in 0003) raises an exception on any insert into
`management_fee_lines` / `expense_lines` whose date falls inside a
`closed` or `locked` period. The bridge:

1. **Pre-checks** by looking up the candidate statement period for the
   effective date in pure code (`decideBridge`). If the period is
   `closed`/`locked`, it persists the link row with
   `bridge_status='skipped_locked_period'` and **never attempts the
   insert** — keeps the audit clean.
2. **Catches** the trigger exception anyway, in case a period gets
   locked between the check and the insert. The link row is updated to
   `failed` with the trigger message and admin can retry once the
   period reopens.

Operators see skipped-locked rows on the finance-bridge page and can
either re-run the bridge later or post a `finance_adjustment` manually.

### 4. Idempotency

The bridge is idempotent at three layers:

1. **Unique index** on `owner_stay_finance_links.owner_stay_request_id`
   — at most one link row per request.
2. **Service short-circuit**: if an existing link is `bridged`, the
   service returns immediately without re-inserting finance rows.
3. **Update-not-insert** for non-bridged states: a request that landed
   in `failed` or `skipped_locked_period` can be re-bridged; the
   service updates the existing link row instead of creating a second
   one.

Re-running the bridge any number of times produces the same finance
rows and the same link state. The mirroring `finance_bridge_status` on
`owner_stay_requests` gives the admin UI a single column to filter on
without joining the link table.

### 5. Reverse path

`reverseFinanceBridgeForOwnerStay` deletes the materialised finance rows
(subject to the locked-period trigger) and flips the link to
`reversed`. Designed for the rare case an admin needs to undo before
close. Audit-logged.

### 6. Notification triggers

V8B's `notification_templates` + `notification_queue` are the substrate.
v9C registers seven owner-stay templates and wires them into the
existing actions:

| Trigger | Template |
|---|---|
| Owner submits a request | `owner_stay.request_received` |
| Conflict requires relocation | `owner_stay.relocation_pending` |
| Admin approves | `owner_stay.approved` |
| Admin rejects | `owner_stay.rejected` |
| Admin or owner cancels | `owner_stay.cancelled` |
| Admin marks completed | `owner_stay.completed` |
| Finance bridge succeeds | `owner_stay.finance_bridged` |

All queue calls are wrapped in try/catch — a failed enqueue never rolls
back the underlying owner-stay action. Dedupe key is
`{templateKey}:{requestId}[:{transition}]` so a status change that
fires twice produces only one notification.

Default channel is `in_app`; email opt-in lives in
`notification_preferences` (already shipped in v8A). Email templates
exist for `owner_stay.approved` and `owner_stay.completed` — the rest
are in-app only by default to avoid noise.

### 7. Public quote API

`GET /api/v1/quote?villaId=<uuid>&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD`

- **Public read endpoint** — no auth. Rate-limited to 60 rpm per IP via
  an in-memory token bucket. Edge / Redis-backed limiter lands later.
- Validated with Zod (`publicQuoteInputSchema`) — bad inputs → 400
  with structured `errors`.
- Method guard: GET only; other verbs → 405.
- `Cache-Control: no-store` — quote freshness matters.
- `Access-Control-Allow-Origin: *` — public read.
- The response shape (`buildPublicQuoteResponse`) deliberately HIDES:
  - rate plan IDs
  - season IDs
  - any internal references
  - any owner-stay / booking / guest data
- `nightly.source` is included as a coarse label (`override` /
  `season` / `base`) for transparency.
- Determinism: identical inputs always produce the same numbers (no
  `Date.now`, no `Math.random`, no rate-plan-internal IDs).

Reason mapping:
- `no_rate_plan` (no plan applies for the villa) → `ok=false`.
- `stop_sell` → `ok=true, available=false, reason='stop_sell'`.
- `min_los_violation` → `ok=true, available=false, reason='min_los_violation'`,
  `minLosRequired` set, warning included. Documented behaviour: a stay
  shorter than required is *not* available; the API user can re-quote a
  longer range.
- `no_nights` → `ok=false, reason='no_nights'` (defensive — Zod already
  rejects `checkOut <= checkIn`).
- `ok` → `ok=true, available=true`.

### 8. Permissions

Two new keys:

- `owner_stay.finance_bridge` — super_admin, director, finance_manager,
  operations_manager, property_manager. Owners + field roles excluded.
- `quote.read_public` — internal use only (the public API itself
  requires no auth, but admin tooling that fetches quotes uses this
  key). Owners + field roles excluded.

### 9. Owner-stay completion

`completeOwnerStayRequestAction` (gated by `owner_stay.approve`) flips
`status='approved'` rows to `status='completed'` and stamps
`completed_at`. The bridge is **not** auto-triggered — admin runs it as
a separate action to keep the audit trail crisp. The owner-facing
`owner_stay.completed` notification fires here.

## Trade-offs accepted

- **Bridge is admin-triggered, not on a job**. We considered firing the
  bridge automatically when status transitions to `completed`, but kept
  it manual for v9C so finance always knows when rows land. v10+ can
  add a "drain pending" cron once we're confident.
- **Notification queue is best-effort**. A failed enqueue never blocks
  the owner-stay mutation. Operators can replay from the request
  detail. This avoids the worst case (the request itself getting stuck
  because of a transient queue issue).
- **Rate limit is in-memory**. Per-process bucket on a single Vercel
  instance — fine for v9C. Multi-instance correctness lands when we
  swap in a Redis-backed limiter (planned for v10 alongside MFA +
  login throttling).
- **Public quote does not include availability** (i.e. doesn't check
  `villa_calendar_blocks`). Quote = "what would these dates cost?"
  Availability check stays internal until the direct-booking surface
  ships in v9D.
- **Compensation lands in `management_fee_lines`, not `revenue_lines`**.
  Some operators model owner-stay compensation as ancillary revenue;
  we model it as a fee owed by the owner to the management company.
  This keeps "rental revenue" clean for KPIs and channel reconciliation.

## Out of scope (deferred)

- Auto-bridge on status transition (deferred to v10).
- Revenue-side variant for compensation (placeholder FK exists).
- FX conversion in the bridge (currency mirrors the rate plan).
- Bank reconciliation / payment processing.
- Dynamic-pricing integration (PriceLabs).
- Direct-booking checkout (a separate v9D track, will reuse `/api/v1/quote`).
- Owner email-preference UI for the new templates (templates exist;
  preference UI still uses v8A).

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent re-run safe).
- **Seed sample data**: `npm run db:seed` adds 7+2 notification
  templates, promotes one v9B request to `completed + bridged` with
  matching finance rows, and queues 3 sample owner-stay notifications.
- **Mark stay completed**: `/dashboard/owner-stays/requests/[id]` →
  "Mark completed".
- **Bridge to finance**:
  - Per request: `/dashboard/owner-stays/requests/[id]` → "Bridge to
    finance".
  - Batch: `/dashboard/owner-stays/finance-bridge` → "Bridge pending".
- **Reverse a bridged stay**: `/dashboard/owner-stays/requests/[id]` →
  "Reverse bridge". Admin only; deletes the finance rows (subject to
  locked-period trigger).
- **Test the public quote**:

  ```bash
  curl -s "$APP_BASE_URL/api/v1/quote?villaId=1eda0002-0000-0000-0000-000000000012&checkIn=2026-04-26&checkOut=2026-04-30" | jq
  ```

  Or use the internal tester at `/dashboard/bookings/rates/quote`.

## Audit & safety checklist

- ✅ Owners cannot SELECT `owner_stay_finance_links` (RLS internal-only).
- ✅ Owners cannot SELECT `revenue_lines` / `expense_lines` /
  `management_fee_lines` directly — they reach finance via owner
  statements.
- ✅ Public quote response never exposes `ratePlanId` / `seasonId` /
  internal IDs.
- ✅ Bridge never writes to `revenue_lines` (verified by reviewing
  `finance-bridge.ts`).
- ✅ Locked-period trigger guarded both pre-check and try/catch.
- ✅ Every bridge attempt + notification trigger calls
  `recordAuditEvent`.
- ✅ Notification queue failures are caught and never block the
  underlying action.
