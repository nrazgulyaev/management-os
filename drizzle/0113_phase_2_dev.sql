-- Phase 2 data-wiring PR 2 — Dev slice.
--
-- 9 net-new tables (12 in the audit; quotes + quote_lines reuse
-- existing procurement_quotations + procurement_quotation_lines,
-- and cashflow_forecasts reuses the existing monthly_projections
-- JSONB shape per the handoff README's "reuse what exists" rule).
--
-- Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
-- Drizzle TS schema lands in the same commit; this is the
-- hand-written SQL (drizzle-kit generate hits the same pre-existing
-- BigInt bug noted in 0112).

BEGIN;

-- =============================================================================
-- 1. milestones — per-project milestone tracker
-- =============================================================================

CREATE TABLE IF NOT EXISTS milestones (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  -- Enum: design | permit | site_prep | foundation | frame | mep | finishes | handover | other
  kind            text        NOT NULL,
  target_date     date        NOT NULL,
  actual_date     date,
  -- Enum: planned | in_progress | done | at_risk | slipped
  status          text        NOT NULL DEFAULT 'planned',
  owner_staff_id  uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestones_project_target_idx
  ON milestones (project_id, target_date);
CREATE INDEX IF NOT EXISTS milestones_status_target_idx
  ON milestones (status, target_date);

-- =============================================================================
-- 2. milestone_dependencies — CPM (critical-path) graph
-- =============================================================================

CREATE TABLE IF NOT EXISTS milestone_dependencies (
  from_milestone_id  uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  to_milestone_id    uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  -- Enum: fs | ss | ff | sf — finish-to-start, start-to-start, etc.
  kind               text NOT NULL,
  PRIMARY KEY (from_milestone_id, to_milestone_id)
);

CREATE INDEX IF NOT EXISTS milestone_dependencies_to_idx
  ON milestone_dependencies (to_milestone_id);

-- =============================================================================
-- 3. rfis — Request for Information queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS rfis (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref                    text        NOT NULL UNIQUE,
  question               text        NOT NULL,
  -- Enum: structural | architectural | mep | finishes | landscape | civil | other
  discipline             text        NOT NULL,
  routed_to_contact_id   uuid        REFERENCES contacts(id) ON DELETE SET NULL,
  routed_by_agent        boolean     NOT NULL DEFAULT false,
  -- Enum: low | medium | high | critical
  priority               text        NOT NULL DEFAULT 'medium',
  opened_at              timestamptz NOT NULL DEFAULT now(),
  responded_at           timestamptz,
  response_text          text,
  resolved_at            timestamptz
);

CREATE INDEX IF NOT EXISTS rfis_project_opened_idx
  ON rfis (project_id, opened_at);
CREATE INDEX IF NOT EXISTS rfis_routed_contact_opened_idx
  ON rfis (routed_to_contact_id, opened_at);

-- =============================================================================
-- 4. capital_calls — call ISSUANCE events (distinct from capital_drawdowns,
--    which is per-commitment post-call money movement)
-- =============================================================================

CREATE TABLE IF NOT EXISTS capital_calls (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid           NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  ref                   text           NOT NULL UNIQUE,
  -- Enum: initial | construction_milestone | overrun | bridge | final
  kind                  text           NOT NULL,
  issued_at             timestamptz    NOT NULL,
  due_at                timestamptz    NOT NULL,
  total_usd             numeric(14, 2) NOT NULL,
  -- Enum: draft | issued | partial | received | cancelled
  status                text           NOT NULL DEFAULT 'draft',
  notes                 text,
  created_by_user_id    uuid           REFERENCES app_users(id) ON DELETE SET NULL,
  created_at            timestamptz    NOT NULL DEFAULT now(),
  updated_at            timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capital_calls_project_issued_idx
  ON capital_calls (project_id, issued_at);
CREATE INDEX IF NOT EXISTS capital_calls_status_due_idx
  ON capital_calls (status, due_at);

-- =============================================================================
-- 5. capital_call_allocations — per-investor split of a capital_call
-- =============================================================================

CREATE TABLE IF NOT EXISTS capital_call_allocations (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         uuid           NOT NULL REFERENCES capital_calls(id) ON DELETE CASCADE,
  investor_id     uuid           NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
  allocated_usd   numeric(14, 2) NOT NULL,
  received_at     timestamptz,
  received_usd    numeric(14, 2),
  wire_ref        text,
  reminded_at     timestamptz
);

CREATE INDEX IF NOT EXISTS capital_call_allocations_call_idx
  ON capital_call_allocations (call_id);
CREATE INDEX IF NOT EXISTS capital_call_allocations_investor_received_idx
  ON capital_call_allocations (investor_id, received_at);

-- =============================================================================
-- 6. boq_revisions — point-in-time BOQ snapshots
-- =============================================================================

CREATE TABLE IF NOT EXISTS boq_revisions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version                integer     NOT NULL,
  snapshot_at            timestamptz NOT NULL DEFAULT now(),
  -- Self-FK chain; null for the first snapshot.
  replaces_id            uuid        REFERENCES boq_revisions(id) ON DELETE SET NULL,
  committed_by_user_id   uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  snapshot               jsonb       NOT NULL,
  note                   text,
  CONSTRAINT boq_revisions_project_version_uniq UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS boq_revisions_project_version_idx
  ON boq_revisions (project_id, version);

-- =============================================================================
-- 7. boq_actuals — append-only per-line actual recordings
-- =============================================================================

CREATE TABLE IF NOT EXISTS boq_actuals (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id             uuid           NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  qty_actual          numeric(14, 3) NOT NULL,
  rate_actual         numeric(14, 2) NOT NULL,
  source_po_id        uuid           REFERENCES purchase_orders(id) ON DELETE SET NULL,
  recorded_at         timestamptz    NOT NULL DEFAULT now(),
  recorded_by_user_id uuid           REFERENCES app_users(id) ON DELETE SET NULL,
  note                text
);

CREATE INDEX IF NOT EXISTS boq_actuals_line_recorded_idx
  ON boq_actuals (line_id, recorded_at);
CREATE INDEX IF NOT EXISTS boq_actuals_source_po_idx
  ON boq_actuals (source_po_id);

-- =============================================================================
-- 8. variance_reviews — QS variance queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS variance_reviews (
  id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id                  uuid           NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  flagged_at               timestamptz    NOT NULL DEFAULT now(),
  -- Enum: over_budget | under_budget | qty_mismatch | rate_change | scope_change | other
  kind                     text           NOT NULL,
  -- Signed: negative = under
  magnitude_pct            numeric(6, 3)  NOT NULL,
  -- Signed in USD
  magnitude_usd            numeric(14, 2) NOT NULL,
  -- Enum: accept | reject | investigate
  qs_decision              text,
  decision_at              timestamptz,
  decision_by_user_id      uuid           REFERENCES app_users(id) ON DELETE SET NULL,
  contractor_reason        text,
  contractor_reason_at     timestamptz,
  qs_note                  text
);

CREATE INDEX IF NOT EXISTS variance_reviews_decision_idx
  ON variance_reviews (qs_decision);
CREATE INDEX IF NOT EXISTS variance_reviews_line_idx
  ON variance_reviews (line_id);

-- =============================================================================
-- 9. vendor_scores — history pattern, one new row per nightly recompute
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendor_scores (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         uuid        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  -- 0..100
  composite         integer     NOT NULL,
  price_score       integer     NOT NULL,
  on_time_score     integer     NOT NULL,
  qa_score          integer     NOT NULL,
  responsive_score  integer     NOT NULL,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  -- e.g. trailing_90d, trailing_180d, ytd. Avoids the Postgres
  -- reserved word `window`.
  score_window      text        NOT NULL DEFAULT 'trailing_90d'
);

CREATE INDEX IF NOT EXISTS vendor_scores_vendor_computed_desc_idx
  ON vendor_scores (vendor_id, computed_at);
CREATE INDEX IF NOT EXISTS vendor_scores_computed_at_idx
  ON vendor_scores (computed_at);

COMMIT;
