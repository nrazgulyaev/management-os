# phase-2-data-wiring · PR 2 — Dev slice

**Source of truth:** `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` § "Dev P1 (12)" + cashflow + agent crons.

## What this PR lands

- 12 net-new tables
- 1 materialized view (`cashflow_forecasts` — re-purposes existing `monthly_projections JSONB` shape, doesn't add a duplicate)
- 11 agent cron registrations
- Dev section of `db/seed/phase-2-data.ts`

Unblocks: milestone tracker on Projects cabinet, RFI inbox, capital-call detail (replaces mock), BOQ variance review + actuals, RFQ quote compare + vendor scorecard with history.

## Tables

### 1. `milestones` → `src/lib/db/schema/milestones.ts`

- `id` uuid PK
- `projectId` uuid FK → `projects.id` (`cascade`)
- `name` text notNull
- `kind` text notNull — enum: `design | permit | site_prep | foundation | frame | mep | finishes | handover | other`
- `targetDate` date notNull
- `actualDate` date nullable
- `status` text notNull default `'planned'` — enum: `planned | in_progress | done | at_risk | slipped`
- `ownerStaffId` uuid FK → `appUsers.id` (`set null`)
- `notes` text nullable
- `createdAt`, `updatedAt`

Indices: `(project_id, target_date)`, `(status, target_date)`.

### 2. `milestone_dependencies` → same file

- `fromMilestoneId` uuid FK → `milestones.id` (`cascade`)
- `toMilestoneId` uuid FK → `milestones.id` (`cascade`)
- `kind` text notNull — enum: `fs | ss | ff | sf` (finish-to-start, start-to-start, etc. — std CPM)
- Composite PK on `(fromMilestoneId, toMilestoneId)`

Index: `(to_milestone_id)` for the inverse lookup (what blocks me?).

### 3. `rfis` → `src/lib/db/schema/rfis.ts`

Request for Information — questions site supervisor / contractor sends to design team.

- `id` uuid PK
- `projectId` uuid FK → `projects.id` (`cascade`)
- `ref` text notNull unique — e.g. `RFI-EV02-0014`
- `question` text notNull
- `discipline` text notNull — enum: `structural | architectural | mep | finishes | landscape | civil | other`
- `routedToContactId` uuid FK → `contacts.id` (`set null`) nullable
- `routedByAgent` boolean notNull default `false` — for audit (rfi-router agent flips this)
- `priority` text notNull default `'medium'` — enum: `low | medium | high | critical`
- `openedAt` timestamptz notNull default now()
- `respondedAt` timestamptz nullable
- `responseText` text nullable
- `resolvedAt` timestamptz nullable

Indices: `(project_id, opened_at)`, `(routed_to_contact_id, opened_at)` for the contact's queue.

### 4. `capital_calls` → `src/lib/db/schema/capital-calls.ts`

- `id` uuid PK
- `projectId` uuid FK → `projects.id` (`restrict` — calls outlive project rename but not deletion)
- `ref` text notNull unique — e.g. `CC-EV02-0004`
- `kind` text notNull — enum: `initial | construction_milestone | overrun | bridge | final`
- `issuedAt` timestamptz notNull
- `dueAt` timestamptz notNull
- `totalUsd` numeric(14,2) notNull
- `status` text notNull default `'draft'` — enum: `draft | issued | partial | received | cancelled`
- `notes` text nullable
- `createdByUserId` uuid FK → `appUsers.id` (`set null`)
- `createdAt`, `updatedAt`

Indices: `(project_id, issued_at)`, `(status, due_at)` for "what's overdue?".

### 5. `capital_call_allocations` → same file

- `id` uuid PK
- `callId` uuid FK → `capital_calls.id` (`cascade`)
- `investorId` uuid FK → existing `companyStructures` / equivalent (verify table name in `company-structures.ts`)
- `allocatedUsd` numeric(14,2) notNull
- `receivedAt` timestamptz nullable
- `receivedUsd` numeric(14,2) nullable
- `wireRef` text nullable
- `remindedAt` timestamptz nullable — last reminder sent

Indices: `(call_id)`, `(investor_id, received_at)`.

### 6. `boq_revisions` → `src/lib/db/schema/boq-revisions.ts`

Snapshot of BOQ at a point in time. The existing `boq_items` rows are the current revision; `boq_revisions` tracks history.

- `id` uuid PK
- `projectId` uuid FK → `projects.id` (`cascade`)
- `version` integer notNull
- `snapshotAt` timestamptz notNull default now()
- `replacesId` uuid FK → `boq_revisions.id` self-FK (`set null`) — chain of revisions
- `committedByUserId` uuid FK → `appUsers.id` (`set null`)
- `snapshot` jsonb notNull — frozen line items + totals as of `snapshotAt`
- `note` text nullable

Indices: `(project_id, version)`, unique `(project_id, version)`.

### 7. `boq_actuals` → `src/lib/db/schema/boq-actuals.ts`

Multi-row per line — every actual recorded gets a row. Aggregation is in queries, not the table.

- `id` uuid PK
- `lineId` uuid FK → `boqItems.id` (existing table; verify name) (`cascade`)
- `qtyActual` numeric(14,3) notNull
- `rateActual` numeric(14,2) notNull
- `sourcePoId` uuid FK → existing PO table (verify name in `procurement.ts`) (`set null`)
- `recordedAt` timestamptz notNull default now()
- `recordedByUserId` uuid FK → `appUsers.id` (`set null`)
- `note` text nullable

Indices: `(line_id, recorded_at)`, `(source_po_id)`.

### 8. `variance_reviews` → `src/lib/db/schema/variance-reviews.ts`

QS variance queue.

- `id` uuid PK
- `lineId` uuid FK → `boqItems.id` (`cascade`)
- `flaggedAt` timestamptz notNull default now()
- `kind` text notNull — enum: `over_budget | under_budget | qty_mismatch | rate_change | scope_change | other`
- `magnitudePct` numeric(6,3) notNull — signed (negative = under)
- `magnitudeUsd` numeric(14,2) notNull — signed
- `qsDecision` text nullable — enum: `accept | reject | investigate`
- `decisionAt` timestamptz nullable
- `decisionByUserId` uuid FK → `appUsers.id` (`set null`)
- `contractorReason` text nullable
- `contractorReasonAt` timestamptz nullable
- `qsNote` text nullable

Indices: `(qs_decision)` for "open queue", `(line_id)`.

### 9. `vendor_scores` → `src/lib/db/schema/vendor-scores.ts`

History pattern — one new row per nightly recompute. Don't UPDATE; INSERT.

- `id` uuid PK
- `vendorId` uuid FK → `contacts.id` (`cascade`)
- `composite` integer notNull — 0..100
- `priceScore` integer notNull
- `onTimeScore` integer notNull
- `qaScore` integer notNull
- `responsiveScore` integer notNull
- `computedAt` timestamptz notNull default now()
- `window` text notNull default `'trailing_90d'` — what window the scoring used

Indices: `(vendor_id, computed_at desc)`, `(computed_at)` for the nightly sweep.

### 10. `quotes` → `src/lib/db/schema/quotes.ts`

- `id` uuid PK
- `rfqId` uuid FK → existing RFQ table (`cascade`) — verify name in `procurement.ts`
- `vendorId` uuid FK → `contacts.id` (`restrict`)
- `totalUsd` numeric(14,2) notNull
- `currency` text notNull default `'USD'`
- `leadTimeDays` integer nullable
- `warrantyText` text nullable
- `submittedAt` timestamptz notNull
- `rawPdfUrl` text nullable — original quote document
- `parsedByAgent` boolean notNull default `false`
- `parseConfidence` numeric(4,3) nullable — 0..1
- `status` text notNull default `'submitted'` — enum: `submitted | shortlisted | awarded | declined | expired`

Indices: `(rfq_id, total_usd)`, `(vendor_id, submitted_at)`.

### 11. `quote_lines` → same file

- `id` uuid PK
- `quoteId` uuid FK → `quotes.id` (`cascade`)
- `boqLineRef` text nullable — soft reference; matching is best-effort
- `description` text notNull
- `qty` numeric(14,3) notNull
- `unit` text notNull
- `rate` numeric(14,2) notNull
- `lineTotal` numeric(14,2) notNull

Index: `(quote_id)`.

### 12. `cashflow_forecasts` — materialized view

The prior audit specifically calls out: **reuse the existing `monthly_projections JSONB` shape in `profitability-cashflow.ts`**, don't duplicate. The "view" here is the cashflow-forecaster cron writing into that JSONB column on a daily schedule.

If a separate materialization is needed (per-project, cross-project consolidated), implement as a `CREATE MATERIALIZED VIEW` in a hand-written companion migration after the Drizzle-generated one. Refresh in the daily cron.

## Agent registrations (11)

| code | trigger |
|---|---|
| `arrival-prep` | hourly |
| `turnover-allocator` | every 90s |
| `schedule-variance-detector` | daily 05:30 |
| `rfi-router` | on RFI compose (event) |
| `weekly-report-composer` | Friday 09:00 |
| `cashflow-forecaster` | daily 04:00 — refreshes mat view + monthly_projections |
| `capital-call-drafter` | event-triggered (project cash < 14d runway) |
| `variance-detector` | hourly + on actuals write |
| `cost-coder` | on invoice upload (event) |
| `cost-anomaly-explainer` | on variance flag (event) |
| `vendor-matcher` | on RFQ create + at award time (event) |
| `quote-parser` | on PDF upload (event) |
| `vendor-score-updater` | nightly 02:00 |

(11 net-new + arrival-prep/turnover-allocator/schedule-variance which the audit groups under "Dev" but actually serve mgmt + dev. Land them all in this PR — audit confirms.)

## Seed

- 4 projects × 14 milestones each (mix of done/in-progress/at-risk)
- 8 RFIs across them (3 routed, 2 unrouted, 3 resolved)
- 6 capital_calls with allocations (split status: 2 received, 2 partial, 1 issued, 1 draft)
- 32 quote rows across 12 RFQs (existing RFQ fixtures)
- 18 vendor_scores rows (3 vendors × 6 nightly snapshots) — populates the trailing trendline
- 4 boq_revisions (one initial + 3 amendments on the active project)
- 24 boq_actuals (across 12 BOQ lines)
- 6 variance_reviews (2 accepted, 1 rejected, 3 open)

All idempotent.

## Validation

```
pnpm db:generate phase-2-dev
pnpm db:migrate
pnpm db:seed
pnpm typecheck && pnpm lint
pnpm smoke:routes
```

Manual: open `/development-os/dashboard` and confirm milestones surface; open `/development-os/cfo/capital-calls/CC-EV02-0004` (or a seeded ref) and confirm allocations render with statuses.

## Commit message

```
feat(phase-2-data-wiring/dev): land 12 tables, 11 agent crons, dev seed

Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
Unblocks milestone tracker, RFI inbox, capital call detail, BOQ variance + actuals,
RFQ quote compare with vendor scorecard history.

milestones (+ deps), rfis, capital_calls (+ allocations), boq_revisions,
boq_actuals, variance_reviews, vendor_scores, quotes (+ lines).
Registers 11 agent crons. Adds dev section of db/seed/phase-2-data.ts.

Refs: phase-2-data-wiring
```
