# Cleanup PR · Data wiring (Phases 2.2 + 2.3 consolidated)

**Purpose:** Land all the schema migrations + server-action wiring that were deferred from Phases 2.2 and 2.3 commit-by-commit. Until this PR merges, every cabinet UI we built is reading from mock data or empty tables.

Reference: `CLAUDE.md` "State of the repo" + commit messages of all 15 cabinet PRs (2.2: 7 PRs · 2.3: 8 PRs).

## Scope — schema migrations (single Drizzle migration file)

Group into one migration `db/migrations/0042_phase2_data_wiring.sql` (adjust number to next available). Order matters for FKs.

### Mgmt P1 tables
- `statement_anomalies` · FK statement_id, kind enum (utility_spike / fee_mismatch / missing_receipt / supplier_hike / other), severity (info / warn / flag), payload JSON, ack_by user_id?, fired_at, resolved_at?
- `owner_insights` · FK owner_id, kind enum (payout_drift / occupancy_regression / portal_disengagement / dispute / maintenance_escalation), level (ok / watch / flag), payload JSON, fired_at, dismissed_at?, dismissed_reason?
- `onboarding_drafts` · FK director_user_id, step (1-3), data JSON, created_at, expires_at (default now() + 14d)
- `sla_breaches` · FK ticket_id, breached_at, resolved_at?, breach_minutes int

### Dev P1 tables
- `projects` · id, code, name, type enum (new-build / retrofit / amenity), status, target_completion date, total_budget_usd numeric, pm_user_id FK
- `milestones` · FK project_id, name, target_date, actual_date?, status enum (planned / in-progress / blocked / done), owner_staff_id FK
- `milestone_dependencies` · from_milestone_id FK, to_milestone_id FK, kind enum (finish-to-start / start-to-start), PK (from, to)
- `rfis` · FK project_id, ref string unique, question text, discipline enum (arch / struct / mep / civil / other), routed_to_contact_id FK?, opened_at, resolved_at?
- `capital_calls` · FK project_id, ref string unique, issued_at, total_usd numeric, status enum (drafting / issued / partial / received)
- `capital_call_allocations` · FK call_id, investor_id, allocated_usd numeric, received_at?, ref string?
- `cashflow_forecasts` · materialized view (refreshed by cashflow-forecaster cron); SQL view definition included
- `boq_revisions` · FK project_id, version int, snapshot_at, replaces_id FK self?
- `boq_lines` · FK revision_id, code string, description text, wp_code string, qty_planned numeric, unit string, rate_planned numeric, line_total_planned numeric · INDEX (revision_id, wp_code)
- `boq_actuals` · FK line_id, qty_actual numeric, rate_actual numeric, source_po_id FK?, recorded_at (multi-row per line allowed)
- `variance_reviews` · FK line_id, flagged_at, kind enum, qs_decision enum (approve / reject / investigate), decision_at?, reason text?
- `vendor_scores` · FK vendor_id, score_composite int 0-100, price_score int, delivery_score int, quality_score int, responsiveness_score int, computed_at · NEW row per refresh (not UPSERT — keep history)
- `quotes` · FK rfq_id, vendor_id, total_usd numeric, lead_time_days int, warranty_text, submitted_at, raw_pdf_url
- `quote_lines` · FK quote_id, boq_line_ref string?, description, qty numeric, unit, rate numeric

### Owner Portal tables
- ALTER `statements`: add columns `owner_state` enum (pending / viewed / acknowledged / disputed / auto_acknowledged / revised) default 'pending', `owner_viewed_at` timestamp?, `owner_acked_at` timestamp?, `owner_disputed_at` timestamp?, `auto_ack_at` timestamp?, `dispute_reason_kind` enum?, `dispute_thread_id` FK?
- `owner_threads` · FK owner_id, subject, last_message_at, unread_count int, kind enum (statement_dispute / personal_stay / q_review / general)
- `owner_messages` · FK thread_id, actor_kind enum (owner / mgmt_user / agent), actor_id, body text, sent_at, inline_actions JSON?
- `owner_notification_prefs` · FK owner_id (unique), 6 boolean columns: statement_ready, statement_reminder, guest_arrivals, maintenance_updates, quarterly_digest, inbox_replies · defaults all true except guest_arrivals (false)
- `documents` · FK owner_id, villa_id FK?, kind enum (msa / annex / legal / tax_summary / tax_cert / statement_pdf / policy), name, file_url, signed_at?, signed_hash?, expires_at?, visible_to_owner bool default true
- `audit_log` extension if not exists · FK actor_user_id, action enum, target_kind, target_id, payload JSON, at timestamp · used by payout-edit + reveal-masked flows

## Server actions / data fns (per-cabinet)

For each cabinet, wire the data fns that were stubbed:

### Mgmt
- `src/features/statements/state-machine.ts` · ensure transition fns write to new owner_state columns + emit cross-system events
- `src/features/bookings/cancellation-policy.ts` · already pure, no wiring needed
- `src/features/maintenance/sla.ts` · already derived; wire breach emitter to `sla_breaches` write

### Dev
- `src/features/boq/variance.ts` · wire to `variance_reviews` table writes on flag
- `src/features/projects/health.ts` · daily cron caches `project_health` (or materialized view)
- `src/features/vendors/scoring.ts` · nightly cron writes new `vendor_scores` row

### Owner
- `src/features/owner-portal/get-home.ts` · server query joining statements + bookings + villas
- `src/features/owner-portal/get-villa.ts` · ownership-gated villa fetch
- `src/features/owner-portal/get-calendar.ts` · monthly bookings + owner_stays
- `src/features/owner-portal/get-inbox.ts` + `get-thread.ts`
- `src/features/owner-portal/get-documents.ts` + `generate-bundle.ts`
- `src/features/owner-portal/get-settings.ts`
- `src/features/owner-statements/state-machine.ts` · full transition fns + 14d auto-ack cron

## Agent triggers

Connect agents that were scaffold-only:
- `statement-preparer` · scheduled cron 1st of month 06:00 · already exists, verify trigger
- `statement-anomaly-detector` · runs after each prepare · writes statement_anomalies
- `owner-intelligence` · daily 05:00 · writes owner_insights
- `onboarding-doc-checker` · invoked from onboarding modal step 1
- `arrival-prep` · hourly · writes arrival_prep_checklist
- `turnover-allocator` · every 90s
- `schedule-variance-detector` · daily 05:30
- `rfi-router` · on RFI compose
- `weekly-report-composer` · Friday 09:00
- `cashflow-forecaster` · daily, refreshes mat view
- `capital-call-drafter` · event (project cash < 14d runway)
- `variance-detector` · hourly + on actuals write
- `cost-coder` · on invoice upload
- `cost-anomaly-explainer` · on variance flag
- `vendor-matcher` · on RFQ create + at award time
- `quote-parser` · on PDF upload
- `vendor-score-updater` · nightly
- `owner-concierge` · on owner_messages insert with actor_kind=owner

Cron registrations go in `src/jobs/registry.ts`.

## Seed data (dev environment only)

Add to `db/seed/phase-2-data.ts`:
- 6 projects across various states/types
- ~142 boq_lines × 6 projects (use the seed in cabinet docs)
- 14 owners with mixed tier/risk
- 8 capital_calls with allocations
- 5 statements per villa for last 5 months · various owner_states
- 18 vendor_scores entries
- 12 RFQs + 32 quotes
- 5 owner_threads with 3-10 messages each
- 4 sample documents per owner across all kinds

## Validation

- `npm run db:migrate` clean
- `npm run db:seed` populates without FK errors
- `npm run typecheck` clean
- `npm run smoke:routes` — every cabinet now loads real data (no "loading" stuck states)
- Visit each Mgmt + Dev + Owner cabinet at `localhost:3000` after seed — pages render with data not placeholder

## Commit (one big PR or split per product?)

**Recommend: single PR** titled `phase-2.x-data-wiring(consolidated): schema + server actions + agents + seed`.

Reasons:
- Migrations are atomic
- FK chains span products (owner_threads → mgmt_users → owners)
- Reduces deploy coordination

**Alternative if Claude Code says it's too big:** split into 3 PRs: Mgmt-tables, Dev-tables, Owner-tables — but in that order, since Owner FKs into Mgmt's statements.

## Estimated size

~30-40 files: 1 migration · 1 seed · ~20 data fns · ~17 agent cron registrations · validation tests. Roughly proportional to the cabinet PRs that came before — a real, sizeable PR.
