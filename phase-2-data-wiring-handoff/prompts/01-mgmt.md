# phase-2-data-wiring · PR 1 — Mgmt slice

**Source of truth:** `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` §§ "Mgmt P1 (4)", "ALTERs (2)", "Agents".

## What this PR lands

- 4 net-new tables
- 1 ALTER (`statements` / `ownerStatements`)
- 4 agent cron registrations
- Mgmt section of `db/seed/phase-2-data.ts`

Unblocks: statement-anomaly UI, owner risk-ring on Owners cabinet, onboarding-doc-checker flow, SLA breach surfacing on Operations.

## Tables

### 1. `statement_anomalies` → `src/lib/db/schema/statement-anomalies.ts`

Append-only row per anomaly the statement-anomaly-detector agent finds while preparing an owner statement.

Columns (per audit):
- `id` uuid PK
- `statementId` uuid FK → `ownerStatements.id` (`on delete cascade`) — anomaly is gone with the statement
- `kind` text enum: `supplier_cost_spike | occupancy_drop | channel_mix_shift | one_off_charge | tax_anomaly | other`
- `severity` text enum: `info | warn | critical`
- `payload` jsonb — agent's structured finding (which line, magnitude, comparison window)
- `firedAt` timestamptz, default now()
- `resolvedAt` timestamptz nullable
- `resolvedByUserId` uuid FK → `appUsers.id` (`set null`)
- `resolutionNote` text nullable

Indices: `(statement_id, fired_at)`, `(kind, severity, fired_at)` for the "all critical opens" cross-statement query.

### 2. `owner_insights` → `src/lib/db/schema/owner-insights.ts`

Surfaced on the Owners cabinet risk-ring + Owner Portal home. One row per insight, dismissable.

Columns:
- `id` uuid PK
- `ownerId` uuid FK → `owners.id` (`cascade`)
- `kind` text enum: `occupancy_trend | adr_trend | maintenance_cost | guest_satisfaction | renewal_window | contract_milestone | other`
- `level` text enum: `info | watch | act` — drives the ring colour
- `payload` jsonb — context (the metric, the comparison window, the recommended action)
- `firedAt` timestamptz, default now()
- `dismissedAt` timestamptz nullable
- `dismissedByUserId` uuid FK → `appUsers.id` (`set null`)
- `dismissedReason` text nullable: `acted | not_relevant | will_review | other`

Indices: `(owner_id, fired_at)`, `(level, fired_at)`.

### 3. `onboarding_drafts` → `src/lib/db/schema/onboarding-drafts.ts`

Holds in-progress new-owner onboarding state across the 3-step modal. TTL 14 days.

Columns:
- `id` uuid PK
- `directorUserId` uuid FK → `appUsers.id` (`cascade`)
- `step` integer notNull default 1 — values 1, 2, 3
- `data` jsonb notNull default `{}` — accumulating step data
- `expiresAt` timestamptz notNull default `now() + interval '14 days'`
- `createdAt`, `updatedAt`

Indices: `(director_user_id, updated_at)`, `expires_at` (for the periodic cleanup job — not in this PR's scope but the column is needed).

### 4. `sla_breaches` → `src/lib/db/schema/sla-breaches.ts`

Append-only log of maintenance-ticket SLA breaches. Drives the breach pill on Operations cabinet maintenance card.

Columns:
- `id` uuid PK
- `ticketId` uuid FK → existing maintenance ticket table (audit says it's `maintenanceTickets`; verify name — if missing, this is a separate gap to flag, not invent)
- `breachedAt` timestamptz notNull
- `resolvedAt` timestamptz nullable
- `breachMinutes` integer notNull — at time of resolve

Indices: `(ticket_id)`, `(breached_at)` for the "breached today" sweep.

## ALTER

### `statements` (verify table name → audit says `ownerStatements`)

Add 7 columns to track owner-side state machine independently of mgmt-side state:

- `ownerState` text notNull default `'pending'` — enum: `pending | viewed | acknowledged | disputed | auto_acknowledged | superseded`
- `ownerViewedAt` timestamptz nullable
- `ownerAckedAt` timestamptz nullable
- `ownerDisputedAt` timestamptz nullable
- `autoAckAt` timestamptz nullable — populated when statement transitions to "ready for owner" so the auto-ack scheduler knows when to fire
- `disputeReasonKind` text nullable — enum: `line_amount | line_missing | line_extra | math_error | other`
- `disputeThreadId` uuid FK → `ownerThreads.id` nullable — populated when dispute opens

**ORDER:** create the new tables FIRST (PR 3 adds `owner_threads`), so this ALTER's FK is technically a forward reference. Make the column nullable + add the FK constraint in PR 3 once `owner_threads` exists. Add a TODO comment in this PR pointing to PR 3.

Index: `(owner_state, auto_ack_at)` for the auto-ack scheduler.

## Agent registrations (4)

Add to `src/features/ai-agents/registry.ts`:

| code | trigger |
|---|---|
| `statement-preparer` | already present — verify cron is wired |
| `statement-anomaly-detector` | runs immediately after each `statement-preparer` run |
| `owner-intelligence` | daily 05:00, project-scoped |
| `onboarding-doc-checker` | event-triggered from onboarding modal step 1 |

Cron registration in `src/features/jobs/definitions.ts` + new job files per agent following the `notification-digest-job.ts` pattern.

## Seed (mgmt section of `db/seed/phase-2-data.ts`)

- 14 mock owners with mixed `tier` (gold / silver / bronze) and `risk` (none / watch / risk)
- 8 `owner_insights` across them (3 act, 3 watch, 2 info)
- 2 in-progress `onboarding_drafts` (one at step 1, one at step 2)
- 4 statements in `owner_state = 'pending'` (current month) + 12 in `acknowledged` (prior months)
- 5 `statement_anomalies` (3 info, 2 warn, 0 critical)
- 6 `sla_breaches` (3 resolved, 3 active — tied to existing maintenance fixtures)

All seed inserts upserted on a deterministic key so re-running is idempotent.

## Validation

```
pnpm db:generate phase-2-mgmt
pnpm db:migrate                # clean against fresh DB
pnpm db:seed                   # clean after migrate
pnpm typecheck && pnpm lint
pnpm smoke:routes              # 819 routes, 0 fatal
```

Manual: open `/dashboard/statements` and confirm one statement shows in `owner_state = 'pending'` (auto_ack_at populated). Open `/dashboard/owners` and confirm risk-ring shows on 3 owners with `owner_insights` at `level='act'`.

## Commit message

```
feat(phase-2-data-wiring/mgmt): land 4 tables, statements ALTER, 4 agent crons

Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md §§ Mgmt P1 + ALTERs.
Unblocks anomaly UI on Statements, risk-ring on Owners, onboarding-doc agent,
SLA breach pills on Operations.

statement_anomalies, owner_insights, onboarding_drafts, sla_breaches.
ownerStatements: +7 columns (owner_state + 6 timestamps/reasons).
Registers statement-anomaly-detector, owner-intelligence, onboarding-doc-checker
crons. Adds mgmt section of db/seed/phase-2-data.ts.

Refs: phase-2-data-wiring
```
