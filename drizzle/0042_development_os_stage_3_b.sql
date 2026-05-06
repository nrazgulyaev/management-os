-- =============================================================================
-- 0042 — Development OS · Stage 3.B
--   Construction Supervisor + Investor Relations + Translation cache.
--
-- Three new tables, all internal-only RLS:
--   - ai_translation_cache       — keyed by (sha256(text), target_lang).
--   - ai_construction_analyses   — one HITL draft per site report.
--   - ai_investor_qa_drafts      — one row per investor question.
--
-- Plus three new agent budget rows seeded inline (idempotent).
--
-- Idempotent. Wrapped in BEGIN ... COMMIT.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0) Drop the legacy ai_assistant_runs status CHECK constraint that
--    Stage 3.A's migration (0041) missed. The original Management OS
--    migration created `ai_assistant_runs_status_check` with a tight
--    set of values; Stage 3.A's widening only added the new
--    `ai_runs_status_check` and left the legacy one in place. Both
--    apply, so the legacy one was silently rejecting the new
--    'dry_run' / 'budget_exceeded' values written by 3.A code.
-- =============================================================================
ALTER TABLE "ai_assistant_runs"
  DROP CONSTRAINT IF EXISTS "ai_assistant_runs_status_check";

-- =============================================================================
-- 1) ai_translation_cache
--   Lookup key is the hex SHA-256 of (source_text + '|' + context). Two rows
--   for the same source text but different `context` are kept separately so
--   prompts that bias translation by domain (e.g. "construction site report")
--   don't poison cache hits for unrelated callers.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_translation_cache" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_text_hash" TEXT NOT NULL,
  "target_language" TEXT NOT NULL,
  "translated_text" TEXT NOT NULL,
  "source_language" TEXT,
  "context" TEXT,
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ai_translation_cache_unique"
    UNIQUE ("source_text_hash", "target_language")
);

CREATE INDEX IF NOT EXISTS "ai_translation_cache_lookup_idx"
  ON "ai_translation_cache" ("source_text_hash", "target_language");

-- =============================================================================
-- 2) ai_construction_analyses
--   One row per generated analysis. UNIQUE on site_report_id keeps the
--   "current draft" semantics; regeneration uses INSERT ... ON CONFLICT
--   to replace, OR (preferred) marks the existing row 'superseded' and
--   inserts a new row — see status enum.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_construction_analyses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_report_id" UUID NOT NULL REFERENCES "site_reports"("id")
    ON DELETE CASCADE,

  "draft_summary" TEXT NOT NULL,
  "draft_summary_translations" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "safety_status" TEXT NOT NULL,
  "safety_concerns" TEXT[],
  "immediate_actions_recommended" TEXT[],
  "estimated_completion_percent" NUMERIC(5, 2),
  "on_track_vs_budget" BOOLEAN,
  "delay_risk_flags" TEXT[],
  "workforce_flags" TEXT[],
  "vendor_flags" TEXT[],
  "recommended_reviewer_actions" TEXT[],

  "raw_response" TEXT NOT NULL,
  "ai_run_id" UUID REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,

  "status" TEXT NOT NULL DEFAULT 'draft',
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reviewer_edits" JSONB,
  "rejection_reason" TEXT,

  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ai_construction_analyses_safety_check"
    CHECK ("safety_status" IN ('normal', 'minor_concerns', 'serious_concerns')),
  CONSTRAINT "ai_construction_analyses_status_check"
    CHECK ("status" IN ('draft', 'approved', 'edited_approved', 'rejected', 'superseded'))
);

-- Partial unique: only one ACTIVE (non-superseded, non-rejected) analysis per
-- report. Superseded/rejected rows are kept for audit. This is enforced via
-- a partial unique index rather than a column constraint so we can
-- re-generate analyses without losing history.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_construction_analyses_one_active_idx"
  ON "ai_construction_analyses" ("site_report_id")
  WHERE "status" IN ('draft', 'approved', 'edited_approved');

CREATE INDEX IF NOT EXISTS "ai_construction_analyses_report_idx"
  ON "ai_construction_analyses" ("site_report_id");
CREATE INDEX IF NOT EXISTS "ai_construction_analyses_status_idx"
  ON "ai_construction_analyses" ("status");
CREATE INDEX IF NOT EXISTS "ai_construction_analyses_safety_idx"
  ON "ai_construction_analyses" ("safety_status");

-- =============================================================================
-- 3) ai_investor_qa_drafts
--   No UNIQUE on investor_id — one row per question. Operators iterate by
--   regenerating (new row) or editing (in-place).
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ai_investor_qa_drafts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "investor_id" UUID NOT NULL REFERENCES "investors"("id") ON DELETE CASCADE,

  "question" TEXT NOT NULL,
  "question_language" TEXT,
  "response_language" TEXT NOT NULL,

  "draft_response" TEXT NOT NULL,
  "context_summary" JSONB NOT NULL,
  "raw_response" TEXT NOT NULL,
  "ai_run_id" UUID REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,

  "status" TEXT NOT NULL DEFAULT 'draft',
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_response" TEXT,

  "sent_at" TIMESTAMPTZ,
  "sent_via" TEXT,
  "delivery_log_id" UUID,

  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ai_investor_qa_drafts_status_check"
    CHECK ("status" IN ('draft', 'approved', 'edited_approved', 'rejected', 'sent')),
  CONSTRAINT "ai_investor_qa_drafts_sent_via_check"
    CHECK ("sent_via" IS NULL OR "sent_via" IN ('email', 'manual_copy', 'whatsapp', 'portal'))
);

CREATE INDEX IF NOT EXISTS "ai_investor_qa_drafts_investor_idx"
  ON "ai_investor_qa_drafts" ("investor_id");
CREATE INDEX IF NOT EXISTS "ai_investor_qa_drafts_status_idx"
  ON "ai_investor_qa_drafts" ("status");
CREATE INDEX IF NOT EXISTS "ai_investor_qa_drafts_generated_idx"
  ON "ai_investor_qa_drafts" ("generated_at" DESC);

-- =============================================================================
-- 4) RLS — internal-only on all three new tables.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'ai_translation_cache',
      'ai_construction_analyses',
      'ai_investor_qa_drafts'
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
-- 5) updated_at triggers on the two HITL-tracked tables.
-- =============================================================================
CREATE OR REPLACE FUNCTION "ai_construction_analyses_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ai_construction_analyses_updated_at_trg"
  ON "ai_construction_analyses";
CREATE TRIGGER "ai_construction_analyses_updated_at_trg"
  BEFORE UPDATE ON "ai_construction_analyses"
  FOR EACH ROW EXECUTE FUNCTION "ai_construction_analyses_set_updated_at"();

CREATE OR REPLACE FUNCTION "ai_investor_qa_drafts_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ai_investor_qa_drafts_updated_at_trg"
  ON "ai_investor_qa_drafts";
CREATE TRIGGER "ai_investor_qa_drafts_updated_at_trg"
  BEFORE UPDATE ON "ai_investor_qa_drafts"
  FOR EACH ROW EXECUTE FUNCTION "ai_investor_qa_drafts_set_updated_at"();

-- =============================================================================
-- 6) Three new agent budgets (idempotent UPSERT).
--   Stage 3.A seeded: dev_os.photo_analyst, dev_os.operations_copilot.
--   Stage 3.B adds:   dev_os.construction_supervisor, dev_os.investor_relations,
--                     dev_os.translator.
-- =============================================================================
INSERT INTO "ai_agent_budgets" (
  "assistant_key", "daily_limit_usd", "monthly_limit_usd",
  "alert_threshold_pct", "is_enabled", "notes"
) VALUES
  ('dev_os.construction_supervisor', '2.00', '20.00', 80, TRUE,
   'Per-report Claude call. Daily $2 ≈ 100 Haiku 4.5 analyses.'),
  ('dev_os.investor_relations',      '1.00', '15.00', 80, TRUE,
   'Per-question Claude call. Manual trigger only.'),
  ('dev_os.translator',              '0.50', '10.00', 80, TRUE,
   'Per-string translation; usually a cache hit. Daily $0.50 ≈ 500 misses.')
ON CONFLICT ("assistant_key") DO UPDATE SET
  "daily_limit_usd" = EXCLUDED."daily_limit_usd",
  "monthly_limit_usd" = EXCLUDED."monthly_limit_usd",
  "notes" = EXCLUDED."notes",
  "updated_at" = now();

COMMIT;
