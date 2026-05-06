-- =============================================================================
-- Prompt 110 — Finance & Statement Transparency Final Polish.
--
-- Four owner-safe projection tables that explain owner statements without
-- mutating accounting rows:
--
--   statement_source_groups          — owner-safe per-source bucket
--   statement_source_group_lines     — internal bridge group ↔ statement_lines
--   statement_reconciliation_warnings — admin + owner-safe warning layer
--   statement_explanation_snapshots  — deterministic owner-facing explanation
--
-- All four are RLS-forced internal-only for write; owners read via
-- public.current_owner_ids() with `owner_visible` gating.  No owner write
-- policies — every mutation flows through internal services.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) statement_source_groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "statement_source_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_statement_id" uuid NOT NULL
    REFERENCES "owner_statements"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "group_key" text NOT NULL,
  "group_label" text NOT NULL,
  "group_description" text,
  "gross_amount_minor" bigint NOT NULL DEFAULT 0,
  "deduction_amount_minor" bigint NOT NULL DEFAULT 0,
  "net_amount_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL,
  "line_count" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "owner_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "statement_source_groups"
    ADD CONSTRAINT statement_source_groups_group_key_check
    CHECK ("group_key" IN (
      'direct_booking_revenue',
      'ota_revenue',
      'guest_service_revenue',
      'owner_stay_charges',
      'maintenance_charges',
      'utility_charges',
      'inventory_charges',
      'service_fulfilment_costs',
      'management_fees',
      'taxes',
      'reserves',
      'payouts',
      'adjustments',
      'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "statement_source_groups_statement_idx"
  ON "statement_source_groups" ("owner_statement_id", "sort_order");
CREATE INDEX IF NOT EXISTS "statement_source_groups_owner_idx"
  ON "statement_source_groups" ("owner_id");
CREATE INDEX IF NOT EXISTS "statement_source_groups_villa_idx"
  ON "statement_source_groups" ("villa_id");
CREATE INDEX IF NOT EXISTS "statement_source_groups_project_idx"
  ON "statement_source_groups" ("project_id");
CREATE INDEX IF NOT EXISTS "statement_source_groups_key_idx"
  ON "statement_source_groups" ("group_key");

CREATE UNIQUE INDEX IF NOT EXISTS "statement_source_groups_unique"
  ON "statement_source_groups"
  ("owner_statement_id", "group_key", "currency");

-- -----------------------------------------------------------------------------
-- 2) statement_source_group_lines
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "statement_source_group_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "statement_source_group_id" uuid NOT NULL
    REFERENCES "statement_source_groups"("id") ON DELETE CASCADE,
  "owner_statement_id" uuid NOT NULL
    REFERENCES "owner_statements"("id") ON DELETE CASCADE,
  "statement_line_id" uuid NOT NULL
    REFERENCES "statement_lines"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "group_key" text NOT NULL,
  "owner_visible_label" text NOT NULL,
  "internal_source_table" text,
  "internal_source_id" uuid,
  "source_trace_status" text NOT NULL DEFAULT 'linked',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "statement_source_group_lines"
    ADD CONSTRAINT statement_source_group_lines_status_check
    CHECK ("source_trace_status" IN (
      'linked',
      'missing_source',
      'ambiguous_source',
      'estimated',
      'manual_adjustment',
      'archived_source'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "statement_source_group_lines_group_idx"
  ON "statement_source_group_lines" ("statement_source_group_id");
CREATE INDEX IF NOT EXISTS "statement_source_group_lines_statement_idx"
  ON "statement_source_group_lines" ("owner_statement_id");
CREATE INDEX IF NOT EXISTS "statement_source_group_lines_line_idx"
  ON "statement_source_group_lines" ("statement_line_id");
CREATE INDEX IF NOT EXISTS "statement_source_group_lines_owner_idx"
  ON "statement_source_group_lines" ("owner_id");
CREATE INDEX IF NOT EXISTS "statement_source_group_lines_key_idx"
  ON "statement_source_group_lines" ("group_key");
CREATE INDEX IF NOT EXISTS "statement_source_group_lines_trace_status_idx"
  ON "statement_source_group_lines" ("source_trace_status");

CREATE UNIQUE INDEX IF NOT EXISTS "statement_source_group_lines_unique"
  ON "statement_source_group_lines"
  ("owner_statement_id", "statement_line_id");

-- -----------------------------------------------------------------------------
-- 3) statement_reconciliation_warnings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "statement_reconciliation_warnings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_statement_id" uuid REFERENCES "owner_statements"("id")
    ON DELETE CASCADE,
  "owner_id" uuid REFERENCES "owners"("id") ON DELETE CASCADE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "warning_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "owner_visible" boolean NOT NULL DEFAULT false,
  "owner_title" text,
  "owner_message" text,
  "internal_title" text NOT NULL,
  "internal_message" text NOT NULL,
  "source_table" text,
  "source_id" uuid,
  "status" text NOT NULL DEFAULT 'open',
  "detected_at" timestamptz NOT NULL DEFAULT now(),
  "acknowledged_at" timestamptz,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "statement_reconciliation_warnings"
    ADD CONSTRAINT statement_reconciliation_warnings_type_check
    CHECK ("warning_type" IN (
      'pending_direct_booking_revenue',
      'pending_guest_service_revenue',
      'pending_owner_stay_charge',
      'pending_material_usage_charge',
      'pending_service_fulfilment_bridge',
      'locked_period_skipped',
      'missing_statement_line',
      'missing_source_trace',
      'unallocated_expense',
      'negative_payout',
      'currency_mismatch',
      'stale_projection',
      'manual_review_required',
      'duplicate_source_risk',
      'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "statement_reconciliation_warnings"
    ADD CONSTRAINT statement_reconciliation_warnings_severity_check
    CHECK ("severity" IN ('info', 'warning', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "statement_reconciliation_warnings"
    ADD CONSTRAINT statement_reconciliation_warnings_status_check
    CHECK ("status" IN ('open', 'acknowledged', 'resolved', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_statement_idx"
  ON "statement_reconciliation_warnings" ("owner_statement_id");
CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_owner_idx"
  ON "statement_reconciliation_warnings" ("owner_id");
CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_villa_idx"
  ON "statement_reconciliation_warnings" ("villa_id");
CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_type_idx"
  ON "statement_reconciliation_warnings" ("warning_type");
CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_severity_idx"
  ON "statement_reconciliation_warnings" ("severity");
CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_status_idx"
  ON "statement_reconciliation_warnings" ("status");

CREATE INDEX IF NOT EXISTS "statement_reconciliation_warnings_open_idx"
  ON "statement_reconciliation_warnings" ("detected_at" DESC)
  WHERE "status" = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS "statement_reconciliation_warnings_open_unique"
  ON "statement_reconciliation_warnings"
  ("warning_type", "source_table", "source_id")
  WHERE "status" = 'open' AND "source_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) statement_explanation_snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "statement_explanation_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_statement_id" uuid NOT NULL
    REFERENCES "owner_statements"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "headline" text NOT NULL,
  "summary" text NOT NULL,
  "bullet_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "payout_explanation" text,
  "revenue_explanation" text,
  "deduction_explanation" text,
  "reserve_explanation" text,
  "warning_explanation" text,
  "currency" text NOT NULL,
  "total_revenue_minor" bigint NOT NULL DEFAULT 0,
  "total_deductions_minor" bigint NOT NULL DEFAULT 0,
  "net_payout_minor" bigint NOT NULL DEFAULT 0,
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "statement_explanation_snapshots_statement_idx"
  ON "statement_explanation_snapshots" ("owner_statement_id");
CREATE INDEX IF NOT EXISTS "statement_explanation_snapshots_owner_idx"
  ON "statement_explanation_snapshots" ("owner_id");
CREATE INDEX IF NOT EXISTS "statement_explanation_snapshots_generated_idx"
  ON "statement_explanation_snapshots" ("generated_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "statement_explanation_snapshots_unique"
  ON "statement_explanation_snapshots" ("owner_statement_id");

-- =============================================================================
-- RLS — internal write, owner self-read.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'statement_source_groups',
      'statement_source_group_lines',
      'statement_reconciliation_warnings',
      'statement_explanation_snapshots'
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

-- Owner self-read: source groups (owner-visible only).
DROP POLICY IF EXISTS owner_self_read ON "statement_source_groups";
CREATE POLICY owner_self_read ON "statement_source_groups"
  FOR SELECT
  USING (
    "owner_visible" = true
    AND "owner_id" IN (SELECT public.current_owner_ids())
  );

-- Owner self-read: group lines (matched to owner's statements only).
-- Group lines do not carry their own `owner_visible` flag, so we gate
-- them through the parent group's `owner_visible` flag.
DROP POLICY IF EXISTS owner_self_read ON "statement_source_group_lines";
CREATE POLICY owner_self_read ON "statement_source_group_lines"
  FOR SELECT
  USING (
    "owner_id" IN (SELECT public.current_owner_ids())
    AND EXISTS (
      SELECT 1 FROM "statement_source_groups" g
       WHERE g.id = "statement_source_group_id"
         AND g.owner_visible = true
    )
  );

-- Owner self-read: warnings (owner_visible only).
DROP POLICY IF EXISTS owner_self_read ON "statement_reconciliation_warnings";
CREATE POLICY owner_self_read ON "statement_reconciliation_warnings"
  FOR SELECT
  USING (
    "owner_visible" = true
    AND "owner_id" IN (SELECT public.current_owner_ids())
  );

-- Owner self-read: explanation snapshot (always owner-safe by design;
-- the generator is the redaction seam).
DROP POLICY IF EXISTS owner_self_read ON "statement_explanation_snapshots";
CREATE POLICY owner_self_read ON "statement_explanation_snapshots"
  FOR SELECT
  USING (
    "owner_id" IN (SELECT public.current_owner_ids())
  );
