-- =============================================================================
-- 0060 — Development OS · Stage 5.C — Executive Command Center
--
-- 3 new tables:
--   - executive_metrics_snapshots   pre-computed dashboard aggregations
--   - risk_radar_alerts             AI/rule-based risk alerts
--   - executive_digests             monthly executive summary
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) executive_metrics_snapshots
-- =============================================================================

CREATE TABLE IF NOT EXISTS "executive_metrics_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "snapshot_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "snapshot_type" TEXT NOT NULL CHECK ("snapshot_type" IN (
    'daily', 'weekly_summary', 'monthly_summary', 'on_demand'
  )),

  "scope" TEXT NOT NULL CHECK ("scope" IN ('company_wide', 'project')),
  "project_id" UUID REFERENCES "projects"("id"),

  -- Cash position
  "total_cash_on_hand_minor" BIGINT NOT NULL DEFAULT 0,
  "cash_by_account" JSONB,
  "cash_in_idr_equivalent_minor" BIGINT,

  -- Receivables
  "total_receivables_minor" BIGINT NOT NULL DEFAULT 0,
  "receivables_aging" JSONB,

  -- Payables
  "total_payables_minor" BIGINT NOT NULL DEFAULT 0,
  "payables_due_next_30_days_minor" BIGINT,
  "payables_overdue_minor" BIGINT,

  -- Tax
  "tax_payable_minor" BIGINT NOT NULL DEFAULT 0,
  "unclassified_transactions_count" INTEGER NOT NULL DEFAULT 0,

  -- Project metrics
  "active_projects_count" INTEGER NOT NULL DEFAULT 0,
  "projects_on_track" INTEGER NOT NULL DEFAULT 0,
  "projects_at_risk" INTEGER NOT NULL DEFAULT 0,
  "projects_delayed" INTEGER NOT NULL DEFAULT 0,

  -- Sales pipeline
  "active_leads_count" INTEGER NOT NULL DEFAULT 0,
  "hot_leads_count" INTEGER NOT NULL DEFAULT 0,
  "reservations_count" INTEGER NOT NULL DEFAULT 0,
  "contracts_signed_this_month" INTEGER NOT NULL DEFAULT 0,
  "total_pipeline_value_minor" BIGINT NOT NULL DEFAULT 0,

  -- Investor metrics
  "total_committed_capital_minor" BIGINT NOT NULL DEFAULT 0,
  "total_drawn_capital_minor" BIGINT NOT NULL DEFAULT 0,
  "pending_distribution_minor" BIGINT NOT NULL DEFAULT 0,
  "pending_investor_requests_count" INTEGER NOT NULL DEFAULT 0,

  -- Operational
  "open_qa_qc_issues" INTEGER NOT NULL DEFAULT 0,
  "critical_qa_qc_issues" INTEGER NOT NULL DEFAULT 0,
  "pending_change_orders" INTEGER NOT NULL DEFAULT 0,
  "high_risk_items_count" INTEGER NOT NULL DEFAULT 0,
  "low_stock_items_count" INTEGER NOT NULL DEFAULT 0,

  -- Profitability
  "total_committed_budget_minor" BIGINT,
  "total_actual_spend_minor" BIGINT,
  "budget_burn_percentage" NUMERIC(5,2),
  "blended_margin_percentage" NUMERIC(7,4),

  -- Forecast
  "payroll_runway_weeks" NUMERIC(5,2),
  "cash_at_30_days_minor" BIGINT,
  "cash_at_60_days_minor" BIGINT,
  "cash_at_90_days_minor" BIGINT,
  "identified_cash_gaps_count" INTEGER NOT NULL DEFAULT 0,

  -- Currency normalization
  "base_currency" TEXT NOT NULL DEFAULT 'IDR',
  "fx_snapshot" JSONB,

  -- Computation metadata
  "computed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "computation_duration_ms" INTEGER,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "executive_metrics_snapshots_date_idx"
  ON "executive_metrics_snapshots"("snapshot_date" DESC);
CREATE INDEX IF NOT EXISTS "executive_metrics_snapshots_type_idx"
  ON "executive_metrics_snapshots"("snapshot_type");
CREATE INDEX IF NOT EXISTS "executive_metrics_snapshots_scope_idx"
  ON "executive_metrics_snapshots"("scope");
CREATE INDEX IF NOT EXISTS "executive_metrics_snapshots_project_idx"
  ON "executive_metrics_snapshots"("project_id");
CREATE INDEX IF NOT EXISTS "executive_metrics_snapshots_latest_idx"
  ON "executive_metrics_snapshots"("scope", "project_id", "snapshot_date" DESC);


-- =============================================================================
-- 2) risk_radar_alerts
-- =============================================================================

CREATE TABLE IF NOT EXISTS "risk_radar_alerts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "alert_code" TEXT UNIQUE NOT NULL,

  "detected_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "detection_source" TEXT NOT NULL,
  "detection_method" TEXT,

  "alert_category" TEXT NOT NULL CHECK ("alert_category" IN (
    'cash_flow', 'budget_overrun', 'schedule_delay',
    'quality_issue', 'investor_relations', 'sales_pipeline',
    'compliance', 'team_capacity', 'data_health',
    'vendor_performance', 'safety', 'tax', 'other'
  )),

  "severity" TEXT NOT NULL CHECK ("severity" IN (
    'info', 'low', 'medium', 'high', 'critical'
  )),

  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,

  "detected_pattern" TEXT,
  "affected_entities" JSONB,
  "supporting_data" JSONB,

  "ai_reasoning" TEXT,
  "confidence_level" TEXT CHECK ("confidence_level" IN ('low', 'medium', 'high')),

  "recommended_action" TEXT,

  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN (
    'open', 'acknowledged', 'investigating', 'resolved', 'false_positive', 'archived'
  )),

  "acknowledged_by" UUID REFERENCES "app_users"("id"),
  "acknowledged_at" TIMESTAMPTZ,
  "resolved_by" UUID REFERENCES "app_users"("id"),
  "resolved_at" TIMESTAMPTZ,
  "resolution_notes" TEXT,

  "similar_alerts_count" INTEGER NOT NULL DEFAULT 0,
  "is_recurring" BOOLEAN NOT NULL DEFAULT FALSE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "risk_radar_alerts_category_idx"
  ON "risk_radar_alerts"("alert_category");
CREATE INDEX IF NOT EXISTS "risk_radar_alerts_severity_idx"
  ON "risk_radar_alerts"("severity");
CREATE INDEX IF NOT EXISTS "risk_radar_alerts_status_idx"
  ON "risk_radar_alerts"("status");
CREATE INDEX IF NOT EXISTS "risk_radar_alerts_detected_idx"
  ON "risk_radar_alerts"("detected_at" DESC);
CREATE INDEX IF NOT EXISTS "risk_radar_alerts_open_idx"
  ON "risk_radar_alerts"("severity", "detected_at" DESC)
  WHERE "status" IN ('open', 'acknowledged', 'investigating');

CREATE OR REPLACE FUNCTION "risk_radar_alerts_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_risk_radar_alerts_updated_at" ON "risk_radar_alerts";
CREATE TRIGGER "trg_risk_radar_alerts_updated_at"
  BEFORE UPDATE ON "risk_radar_alerts"
  FOR EACH ROW EXECUTE FUNCTION "risk_radar_alerts_set_updated_at"();


-- =============================================================================
-- 3) executive_digests
-- =============================================================================

CREATE TABLE IF NOT EXISTS "executive_digests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "digest_code" TEXT UNIQUE NOT NULL,

  "period_label" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "digest_type" TEXT NOT NULL CHECK ("digest_type" IN (
    'weekly', 'monthly', 'quarterly', 'on_demand'
  )),

  "executive_summary" TEXT NOT NULL,

  "cash_position_section" TEXT,
  "project_progress_section" TEXT,
  "sales_section" TEXT,
  "investor_section" TEXT,
  "operations_section" TEXT,
  "risks_section" TEXT,

  "key_wins" TEXT[] NOT NULL DEFAULT '{}',
  "key_concerns" TEXT[] NOT NULL DEFAULT '{}',
  "recommended_actions" TEXT[] NOT NULL DEFAULT '{}',

  "metrics_snapshot_id" UUID REFERENCES "executive_metrics_snapshots"("id"),

  "ai_generated" BOOLEAN NOT NULL DEFAULT FALSE,
  "ai_provider" TEXT,
  "ai_model" TEXT,
  "ai_generation_metadata" JSONB,

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'under_review', 'approved', 'distributed', 'archived'
  )),

  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,
  "distributed_to" JSONB,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("period_end" >= "period_start")
);

CREATE INDEX IF NOT EXISTS "executive_digests_period_idx"
  ON "executive_digests"("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "executive_digests_type_idx"
  ON "executive_digests"("digest_type");
CREATE INDEX IF NOT EXISTS "executive_digests_status_idx"
  ON "executive_digests"("status");

CREATE OR REPLACE FUNCTION "executive_digests_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_executive_digests_updated_at" ON "executive_digests";
CREATE TRIGGER "trg_executive_digests_updated_at"
  BEFORE UPDATE ON "executive_digests"
  FOR EACH ROW EXECUTE FUNCTION "executive_digests_set_updated_at"();


-- =============================================================================
-- 4) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'executive_metrics_snapshots', 'risk_radar_alerts', 'executive_digests'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
