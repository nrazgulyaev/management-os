-- =============================================================================
-- 0043 — Development OS · Stage 3.C
--   Distribution Preview Assistant + Document Understanding Agent.
--
-- Two new internal-only RLS tables, two new agent budgets seeded inline.
-- Both agents are HITL-strict: distribution suggestions never auto-declare,
-- document extractions never auto-create transactions/deliveries.
--
-- Idempotent. Wrapped in BEGIN ... COMMIT.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) ai_distribution_suggestions
--   One suggestion per (project, generation event). Many suggestions per
--   project over time — supersession handled by the `status='superseded'`
--   transition on regeneration. The partial unique index keeps "one
--   ACTIVE suggestion per project" without losing audit history.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_distribution_suggestions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,

  -- Suggestion content
  "suggested_amount_usd_minor" BIGINT NOT NULL,
  "suggested_distribution_type" TEXT NOT NULL,
  "suggested_effective_date" DATE NOT NULL,

  -- Reasoning context (audit trail)
  "current_company_balance_usd_minor" BIGINT NOT NULL,
  "current_project_balance_usd_minor" BIGINT NOT NULL,
  "recent_inflows_90d_usd_minor" BIGINT NOT NULL,
  "recent_outflows_90d_usd_minor" BIGINT NOT NULL,
  "net_cash_flow_90d_usd_minor" BIGINT NOT NULL,
  "is_self_sustaining" BOOLEAN NOT NULL,
  "buffer_amount_usd_minor" BIGINT NOT NULL,

  -- Outstanding obligations
  "outstanding_capital_usd_minor" BIGINT NOT NULL DEFAULT 0,
  "outstanding_invoices_usd_minor" BIGINT NOT NULL DEFAULT 0,
  "outstanding_commitments_usd_minor" BIGINT NOT NULL DEFAULT 0,

  -- AI reasoning
  "reasoning" TEXT NOT NULL,
  "confidence_level" TEXT NOT NULL,
  "risk_factors" TEXT[],
  "recommendations" TEXT[],

  -- Allocation preview (computed via existing previewDistribution helper)
  "allocation_preview" JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- AI metadata
  "raw_response" TEXT NOT NULL,
  "ai_run_id" UUID REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,
  "triggered_by" TEXT NOT NULL DEFAULT 'manual_request',

  -- HITL lifecycle
  "status" TEXT NOT NULL DEFAULT 'draft',
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewer_notes" TEXT,

  -- If declared: link to the actual distribution row.
  "related_distribution_id" UUID REFERENCES "distributions"("id")
    ON DELETE SET NULL,

  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ai_distribution_suggestions_type_check"
    CHECK ("suggested_distribution_type" IN (
      'capital_return', 'profit_distribution', 'mixed', 'none'
    )),
  CONSTRAINT "ai_distribution_suggestions_confidence_check"
    CHECK ("confidence_level" IN ('low', 'medium', 'high')),
  CONSTRAINT "ai_distribution_suggestions_status_check"
    CHECK ("status" IN ('draft', 'reviewed', 'declared', 'rejected', 'superseded')),
  CONSTRAINT "ai_distribution_suggestions_triggered_by_check"
    CHECK ("triggered_by" IN ('cron_check', 'manual_request', 'threshold_event')),
  -- Defense in depth: amount must be non-negative.
  CONSTRAINT "ai_distribution_suggestions_amount_nonneg_check"
    CHECK ("suggested_amount_usd_minor" >= 0)
);

-- One ACTIVE suggestion per project (draft / reviewed only).
CREATE UNIQUE INDEX IF NOT EXISTS "ai_distribution_suggestions_one_active_idx"
  ON "ai_distribution_suggestions" ("project_id")
  WHERE "status" IN ('draft', 'reviewed');

CREATE INDEX IF NOT EXISTS "ai_distribution_suggestions_project_idx"
  ON "ai_distribution_suggestions" ("project_id");
CREATE INDEX IF NOT EXISTS "ai_distribution_suggestions_status_idx"
  ON "ai_distribution_suggestions" ("status");
CREATE INDEX IF NOT EXISTS "ai_distribution_suggestions_generated_idx"
  ON "ai_distribution_suggestions" ("generated_at" DESC);

-- =============================================================================
-- 2) ai_document_extractions
--   One extraction per document × generation. Re-extraction supersedes
--   the prior row — partial unique on the active set keeps inbox clean.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_document_extractions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "document_id" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "document_type" TEXT NOT NULL,

  -- Detection metadata
  "detected_language" TEXT,
  "detected_quality" TEXT,

  -- Extracted data (varies by type — see lib/development/ai/document-understanding.ts)
  "extracted_data" JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Suggested mappings to existing entities.
  "suggested_vendor_id" UUID REFERENCES "vendors"("id") ON DELETE SET NULL,
  "suggested_project_id" UUID REFERENCES "projects"("id") ON DELETE SET NULL,
  "suggested_category_id" UUID REFERENCES "dev_cost_categories"("id")
    ON DELETE SET NULL,
  "suggested_po_id" UUID REFERENCES "material_purchase_orders"("id")
    ON DELETE SET NULL,
  "suggested_bank_account_id" UUID REFERENCES "dev_bank_accounts"("id")
    ON DELETE SET NULL,

  -- Match confidence (0.00 — 1.00).
  "vendor_match_confidence" NUMERIC(3, 2),
  "category_match_confidence" NUMERIC(3, 2),

  -- AI reasoning
  "reasoning" TEXT NOT NULL,
  "ambiguities" TEXT[],

  -- AI metadata
  "raw_response" TEXT NOT NULL,
  "ai_run_id" UUID REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,

  -- HITL lifecycle
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewer_edits" JSONB,
  "rejection_reason" TEXT,

  -- If approved + actioned: link to created entities.
  "created_transaction_id" UUID REFERENCES "dev_transactions"("id")
    ON DELETE SET NULL,
  "created_delivery_id" UUID REFERENCES "material_deliveries"("id")
    ON DELETE SET NULL,

  "uploaded_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ai_document_extractions_type_check"
    CHECK ("document_type" IN (
      'receipt', 'invoice', 'delivery_note', 'contract', 'other'
    )),
  CONSTRAINT "ai_document_extractions_quality_check"
    CHECK ("detected_quality" IS NULL OR
           "detected_quality" IN ('high', 'medium', 'low', 'unreadable')),
  CONSTRAINT "ai_document_extractions_status_check"
    CHECK ("status" IN (
      'pending_review', 'approved', 'edited_approved', 'rejected', 'duplicate', 'superseded'
    )),
  CONSTRAINT "ai_document_extractions_vendor_conf_check"
    CHECK ("vendor_match_confidence" IS NULL OR
           "vendor_match_confidence" BETWEEN 0 AND 1),
  CONSTRAINT "ai_document_extractions_category_conf_check"
    CHECK ("category_match_confidence" IS NULL OR
           "category_match_confidence" BETWEEN 0 AND 1)
);

-- One ACTIVE extraction per document (pending_review / approved /
-- edited_approved / duplicate). Rejected + superseded rows accumulate
-- for audit.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_document_extractions_one_active_idx"
  ON "ai_document_extractions" ("document_id")
  WHERE "status" IN ('pending_review', 'approved', 'edited_approved', 'duplicate');

CREATE INDEX IF NOT EXISTS "ai_document_extractions_document_idx"
  ON "ai_document_extractions" ("document_id");
CREATE INDEX IF NOT EXISTS "ai_document_extractions_type_idx"
  ON "ai_document_extractions" ("document_type");
CREATE INDEX IF NOT EXISTS "ai_document_extractions_status_idx"
  ON "ai_document_extractions" ("status");
CREATE INDEX IF NOT EXISTS "ai_document_extractions_generated_idx"
  ON "ai_document_extractions" ("generated_at" DESC);

-- =============================================================================
-- 3) RLS — internal-only on both new tables.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'ai_distribution_suggestions',
      'ai_document_extractions'
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

-- =============================================================================
-- 4) updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION "ai_distribution_suggestions_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ai_distribution_suggestions_updated_at_trg"
  ON "ai_distribution_suggestions";
CREATE TRIGGER "ai_distribution_suggestions_updated_at_trg"
  BEFORE UPDATE ON "ai_distribution_suggestions"
  FOR EACH ROW EXECUTE FUNCTION "ai_distribution_suggestions_set_updated_at"();

CREATE OR REPLACE FUNCTION "ai_document_extractions_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ai_document_extractions_updated_at_trg"
  ON "ai_document_extractions";
CREATE TRIGGER "ai_document_extractions_updated_at_trg"
  BEFORE UPDATE ON "ai_document_extractions"
  FOR EACH ROW EXECUTE FUNCTION "ai_document_extractions_set_updated_at"();

-- =============================================================================
-- 5) Two new agent budgets (idempotent UPSERT).
--   Distribution Preview is low frequency, complex reasoning — small budget.
--   Document Understanding is higher volume — larger budget.
-- =============================================================================
INSERT INTO "ai_agent_budgets" (
  "assistant_key", "daily_limit_usd", "monthly_limit_usd",
  "alert_threshold_pct", "is_enabled", "notes"
) VALUES
  ('dev_os.distribution_preview',   '1.00', '15.00', 80, TRUE,
   'Per-project weekly suggestion. Low frequency, complex reasoning over financials.'),
  ('dev_os.document_understanding', '2.00', '25.00', 80, TRUE,
   'Per-document extraction. Volume from receipt processing; daily $2 ≈ 200 receipts.')
ON CONFLICT ("assistant_key") DO UPDATE SET
  "daily_limit_usd" = EXCLUDED."daily_limit_usd",
  "monthly_limit_usd" = EXCLUDED."monthly_limit_usd",
  "notes" = EXCLUDED."notes",
  "updated_at" = now();

COMMIT;
