# ADR-0015 — Preventive Maintenance Intelligence + Utilities (v9D)

Status: Accepted · 2026-04-27

## Context

V9A introduced `villa_calendar_blocks` (the master availability primitive)
and a readiness lifecycle. V9B/V9C added owner stays, relocation, pricing,
finance bridge, and the public quote API.

V9D closes the operations-facing intelligence layer: a structured
preventive-maintenance template library, per-villa plans with smart
window suggestions, a utilities ledger (accounts + readings + payment
reminders), and a unified risk feed. NO IoT integrations — every
utility account is operator-managed; every reading is human-recorded.

## Decisions

### 1. Templates → plans → tasks

The preventive flow is **template → plan → suggestion → task**:

```
maintenance_templates  (global catalog: AC, pool, pest, garden, …)
        │
        ▼ (operator clones into a per-villa instance)
villa_maintenance_plans  (cadence + preferences + nextDueAt)
        │
        ├─ suggestMaintenanceWindows → maintenance_window_suggestions
        │
        ▼ (accept suggestion OR generate now OR batch generate due)
operation_tasks (existing V4 system, source='preventive')
```

Key design choices:

- **Templates are intentionally global**, not per-project. The Bali villa
  catalog is small (≈8 categories); per-project tweaks live on the plan.
- **Plans own the calendar**, not templates. `nextDueAt` is the single
  source of truth for "due" — no additional schedule table.
- **Task generation never duplicates** — every task code goes through the
  existing `nextDailyCounter("MNT")` helper that v4 ships.
- When a plan **requires the villa empty** OR has **medium/high
  disruption**, generation also writes a `maintenance_block` calendar
  block (V9A) so the front office sees it immediately.

### 2. Smart window suggestions — pure logic

`scheduling-pure.ts` is the canonical engine. The DB-aware service in
`scheduling.ts` queries villa blocks + project-wide same-category tasks
and feeds them into the pure scorer. Hard rejects:

- Active `out_of_order` / `internal_hold` / `maintenance_block` overlap
  → reject.
- `requires_villa_empty=true` AND any `guest_booking` overlap → reject.
- `canBeDoneWhileOccupied=false` AND `guest_booking` overlap → reject.
- `guest_disruption_level` in {medium, high} during `guest_booking` →
  reject.
- Date hits an `avoid_weekday` → reject.

Soft scoring (range 0..1):

| Signal | Effect |
|---|---|
| Base | +0.6 |
| Preferred weekday | +0.15 |
| Villa fully free | +0.2 |
| Same project, same category, same date | up to −0.3 (clustering) |
| During guest stay (low disruption only) | −0.1 |

### 3. Anti-clustering rule

The scorer applies a per-project, per-category, per-date threshold:
**no more than 30 % of project villas may have the same category
scheduled on the same day**. The pure helper `wouldExceedClusteringLimit`
exposes the rule so future task-routing UIs (and tests) share the
canonical interpretation.

### 4. Utility accounts: thresholds + readings + payments

`utility_accounts` per villa (or project for shared ISP) carry two
thresholds in minor units: `low_balance_threshold_minor` and
`critical_balance_threshold_minor`. `utility_readings` is append-only;
the latest balance row drives the risk classification.

`recordUtilityReadingAction` calls the pure
`classifyUtilityBalance(latestBalanceMinor, thresholds)` and, if the
level is `low` or `critical`, opens a `maintenance_risk_events` row via
the partial unique index `(risk_type, source_type, source_id) WHERE
status='open'` — idempotent.

Payment reminders are operator-side only. Marking paid:

1. If `amount_minor > 0` AND the period for `expense_date` is open:
   create an `expense_lines` row with `expense_type='utility_payment'`,
   `allocation_scope='villa'`, `owner_chargeable=true`. Link the row id
   on the reminder.
2. If the period is locked: catch the trigger exception, mark paid
   anyway, and write the skipped-expense note. Operator can post a
   `finance_adjustment` later.
3. Audit-logged.

### 5. Unified risk feed

`maintenance_risk_events` covers seven risk types from a single source
of truth. The scanner:

- `overdue_maintenance` — `villa_maintenance_plans.next_due_at < now`.
- `utility_low_balance` / `utility_critical_balance` — latest reading
  vs. thresholds (also created at insert time).
- `no_recent_reading` — last reading age vs. 30/60-day threshold.
- `repeated_ticket` — ≥3 open tickets per villa.
- `upcoming_guest_conflict` — a `maintenance_block` overlaps a confirmed
  booking in the next 7 days.
- `arrival_not_ready` — booking checking in today, readiness ≠ ready /
  occupied / cleaning / inspection.

Each scanner pass is **idempotent** via the open-only unique index, and
queues an in-app notification per role (`operations_manager`,
`property_manager`, `finance_manager`) per type. Failures don't block
the scan.

### 6. Notification templates

Seven new templates registered in seed. Channel default is `in_app`.
Email variants land later when operator preferences are configured.

```
maintenance.overdue
maintenance.window_suggested
utility.low_balance
utility.critical_balance
utility.payment_due
utility.payment_overdue
readiness.arrival_not_ready
```

### 7. Permissions

Eight new keys: `maintenance_intelligence.{read,write,generate}`,
`utilities.{read,write,pay}`, `maintenance_risk.{read,manage}`. Owners
and guests have no access to any v9D table; field staff can read
relevant maintenance plans + utility checks (`maintenance_intelligence
.read`, `utilities.read`) but cannot trigger generation or payments.

## Trade-offs

- **No IoT today.** Every utility reading is human. The schema is ready
  for a future `source='api'` import path.
- **No background job for `scanMaintenanceRisks`.** Operators trigger via
  the dashboard button. A cron lands later once we trust the noise rate.
- **Single risk per source.** A villa with 5 open maintenance tickets gets
  ONE `repeated_ticket` row, not five. Resolving the count is the fix.
- **Clustering rule is project-wide, not project+region.** Bali clusters
  by complex; we don't have a "complex" entity yet. When that lands the
  rule moves up one level.

## Out of scope (deferred)

- Real PLN/PDAM/ISP integrations.
- Automatic PO generation from low-stock + low-utility scans.
- Per-template owner-statement narrative.
- Smart-lock battery alerts driven by lock APIs (we just check via
  manual reading today).

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent re-run safe).
- **Seed**: `npm run db:seed` adds 8 templates + 7 plans + 4 utility
  accounts + 3 readings (one CRITICAL on Enso ES-S5) + 2 payment
  reminders + 2 sample risk events + 7 notification templates.
- **Generate maintenance tasks**:
  - Per plan: `/dashboard/maintenance-intelligence/plans/[id]` →
    "Generate task" or "Refresh suggestions" → "Accept".
  - Batch: `/dashboard/maintenance-intelligence/plans` → "Generate due tasks".
- **Record utility reading**:
  `/dashboard/utilities/accounts/[id]` → "Record reading". Risk rows
  open automatically when a balance is below threshold.
- **Pay a utility**: `/dashboard/utilities/payments` → "Mark paid".
  Locked-period handling kicks in transparently.
- **Run the risk scanner**: `/dashboard/maintenance-intelligence/risks`
  → "Scan risks" or `/dashboard/utilities/risks` → "Scan risks".
