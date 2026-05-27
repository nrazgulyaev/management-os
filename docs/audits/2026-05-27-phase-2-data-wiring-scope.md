# Phase 2 data-wiring — scope audit

**Date:** 2026-05-27
**Purpose:** Define the precise scope of the deferred data-wiring PR for the 15 cabinet PRs shipped across Phases 2.2 (7 PRs) + 2.3 (8 PRs). This document replaces the "do everything in one PR" framing of `claude-code-prompts/cleanup-A-data-wiring.md` with a concrete gap analysis against the live 463-table schema.

## TL;DR

- The repo already has **111 migrations / 463 pgTables** and a working query layer (`owner-portal-queries.ts`).
- Most of the data fns the cleanup prompt wants to "wire" **already exist** — they read live data via the queries layer for the bits the schema covers and mock the rest.
- All **17 agent files exist** as code stubs; none are registered in the cron registry.
- The actual gap is **20 net-new tables + 2 ALTERs + 17 cron registrations + a seed file**. That's a real PR, but smaller than the cleanup prompt implied.

## Tables — gap analysis

### Net-new (20)

**Mgmt P1 (4)** — entirely new
- `statement_anomalies` (FK statement_id, kind enum, severity, payload JSON, ack_by, fired_at, resolved_at)
- `owner_insights` (FK owner_id, kind enum, level, payload JSON, fired_at, dismissed_at, dismissed_reason)
- `onboarding_drafts` (FK director_user_id, step 1-3, data JSON, expires_at default now() + 14d)
- `sla_breaches` (FK ticket_id, breached_at, resolved_at?, breach_minutes)

**Dev P1 (12)** — entirely new
- `milestones` (FK project_id, name, target_date, actual_date?, status enum, owner_staff_id)
- `milestone_dependencies` (from/to milestone_id, kind enum, composite PK)
- `rfis` (FK project_id, ref unique, question, discipline enum, routed_to_contact_id?, opened_at, resolved_at?)
- `capital_calls` (FK project_id, ref unique, issued_at, total_usd, status enum)
- `capital_call_allocations` (FK call_id, investor_id, allocated_usd, received_at?, ref?)
- `boq_revisions` (FK project_id, version int, snapshot_at, replaces_id self-FK?)
- `boq_actuals` (FK line_id, qty_actual, rate_actual, source_po_id?, recorded_at — multi-row per line)
- `variance_reviews` (FK line_id, flagged_at, kind enum, qs_decision enum, decision_at?, reason)
- `vendor_scores` (FK vendor_id, composite + 4 subscores, computed_at — history pattern, NEW row per refresh)
- `quotes` (FK rfq_id, vendor_id, total_usd, lead_time_days, warranty_text, submitted_at, raw_pdf_url)
- `quote_lines` (FK quote_id, boq_line_ref?, description, qty, unit, rate)
- `cashflow_forecasts` materialized view definition (refreshed by cashflow-forecaster cron)

**Owner Portal (4)** — entirely new
- `owner_threads` (FK owner_id, subject, last_message_at, unread_count, kind enum)
- `owner_messages` (FK thread_id, actor_kind enum, actor_id, body, sent_at, inline_actions JSON?)
- `owner_notification_prefs` (FK owner_id unique, 6 booleans with defaults — all true except `guest_arrivals` = false)
- `documents` overlay: the existing `documents` table needs `owner_id FK`, `kind` enum extension, `signed_at`, `signed_hash`, `expires_at`, `visible_to_owner` — see ALTERs below

### Already exists — no migration needed (3)

- `projects` — exists; villa-shaped fields differ. The Dev OS uses a different table for capital projects — confirm shape before adding `code/type/pm_user_id/total_budget_usd` columns.
- `boq_lines` — exists under name `boq_items` (rename in app code, or add view alias)
- `cashflow_forecasts` — exists in `profitability-cashflow.ts` with `monthly_projections JSONB` shape. Repurpose, don't recreate.
- `audit_log` — exists as `auditEvents` in `audit.ts`. Use as-is for payout-edit + reveal-masked logging.

### ALTERs (2)

- `statements` (or `ownerStatements` per existing schema) — add 7 columns: `owner_state` enum, `owner_viewed_at`, `owner_acked_at`, `owner_disputed_at`, `auto_ack_at`, `dispute_reason_kind` enum, `dispute_thread_id` FK to `owner_threads.id`.
- `documents` — add `owner_id FK`, extend `kind` enum, add `signed_at`, `signed_hash`, `expires_at`, `visible_to_owner` (default true). Verify against existing kind enum to avoid clobber.

## Data functions — already wired or stubbed

All 12 referenced fns **exist on disk**. Status:

| File | Today | Gap |
|---|---|---|
| `owner-portal-queries.ts` | LIVE (real queries) | — |
| `get-home.ts` | partly live (KPIs + statements + villas), mocks `upcoming` + `recentActivity` | Wire bookings + owner_activity_log joins |
| `get-villa.ts` | ownership-validated, real villa header | Wire `villa_photos` + `maintenance_tickets` joins for photos + monthly + maintenance log |
| `get-calendar.ts` | returns villa picker, empty events/pipeline | Wire bookings + owner_stays for the month |
| `get-inbox.ts` / `get-thread.ts` | empty arrays | Wire `owner_threads` + `owner_messages` reads (after migration) |
| `get-documents.ts` | empty 4-group skeleton | Wire `documents` table reads filtered by `visible_to_owner` (after ALTER) |
| `get-settings.ts` | default values | Wire `owner_profile` + `owner_notification_prefs` reads (after migration) |
| `generate-bundle.ts` | unstable_cache wrapper, stub URL | Hook into `src/lib/pdf/` stitcher; cache-invalidation on document insert |
| `statements/state-machine.ts` | full implementation (452 ln) | Verify transition fns write to new owner_state columns |
| `owner-statements/state-machine.ts` | full transitions + auto-ack | Same as above |
| `maintenance/sla.ts` | pure derivation | Wire breach emitter to `sla_breaches` writes |
| `boq/variance.ts` | pure | Wire flag emitter to `variance_reviews` writes |
| `projects/health.ts` | pure | Daily cron caches into `project_health` materialized view |
| `vendors/scoring.ts` | pure | Nightly cron writes new `vendor_scores` row (history pattern) |

## Agents — 17 files, 0 registrations

All agent files exist under `src/features/ai-agents/**`. None except `statement-preparer` + `owner-intelligence` have entries in `MGMT_AGENT_CODES`. None have cron triggers in `src/features/jobs/actions.ts`.

Registration work:

| Agent | Cron / trigger |
|---|---|
| statement-preparer | 1st of month 06:00 (already in MGMT_AGENT_CODES, verify trigger) |
| statement-anomaly-detector | after each statement prepare |
| owner-intelligence | daily 05:00 |
| onboarding-doc-checker | invoked from onboarding modal step 1 |
| arrival-prep | hourly |
| turnover-allocator | every 90s |
| schedule-variance-detector | daily 05:30 |
| rfi-router | on RFI compose |
| weekly-report-composer | Friday 09:00 |
| cashflow-forecaster | daily, refreshes mat view |
| capital-call-drafter | event-triggered (project cash < 14d runway) |
| variance-detector | hourly + on actuals write |
| cost-coder | on invoice upload |
| cost-anomaly-explainer | on variance flag |
| vendor-matcher | on RFQ create + at award time |
| quote-parser | on PDF upload |
| vendor-score-updater | nightly |
| owner-concierge | on owner_messages insert with actor_kind=owner |

## Seed data — `db/seed/phase-2-data.ts`

Per cleanup prompt:
- 6 projects × 142 BOQ lines each (≈ 850 rows)
- 14 owners with mixed tier/risk
- 8 capital_calls with allocations
- 5 statements per villa × 5 months × N villas (varies)
- 18 vendor_scores entries
- 12 RFQs + 32 quotes
- 5 owner_threads with 3-10 messages each
- 4 documents per owner across all kinds

## Recommended PR slicing

The cleanup prompt's "one big PR" is workable but coordination-heavy. Suggested split — **3 PRs in dependency order**:

1. **`phase-2-data-wiring(mgmt)`** — 4 new tables (statement_anomalies, owner_insights, onboarding_drafts, sla_breaches) + statements ALTER + 4 agent registrations (statement-preparer, anomaly, owner-intelligence, onboarding-doc-checker). State-machine fns updated to write owner_state. Mgmt seed data.

2. **`phase-2-data-wiring(dev)`** — 12 new Dev P1 tables + cashflow view + 7 agent registrations (cashflow, capital-call, variance, cost-coder, cost-anomaly, vendor-matcher, quote-parser, vendor-score, schedule-variance, rfi-router, weekly-report). Dev seed data.

3. **`phase-2-data-wiring(owner)`** — 4 new Owner tables (threads, messages, prefs) + documents ALTER + 6 data fns wired to real queries + owner-concierge cron + bundle stitcher wired to `src/lib/pdf/`. Owner seed data.

Each PR is ~10-15 files, validates with `db:migrate` + `db:seed` + `typecheck` + `smoke:routes`, and unblocks one product's UI from mock data.

## Why this wasn't done in one session

- Migration must not collide with the 111 existing migration files or 463-table schema. Several requested table names (`projects`, `boq_lines`, `cashflow_forecasts`) collide with existing tables under different shapes — needs careful audit before SQL is written.
- Drizzle schema TS files need to match column-by-column with the SQL migration; the existing schema layout splits across 60+ files with specific conventions for FK + RLS that need to be followed.
- Seed data requires realistic foreign keys to existing org/villa/user rows — needs DB introspection.
- Effort is on the order of **15.5 senior-eng days** per the prior `task-6-7-data-wiring-todo.md` audit. A real, sizeable PR — not a 30-minute session.

## Next steps

The cabinet UIs ship and validate today. The data-wiring slices above can be queued as discrete PRs without touching the 2.2/2.3 UI work that's now landed.
