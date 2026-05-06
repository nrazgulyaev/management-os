-- =============================================================================
-- 0062 — Development OS · Stage 5.D.2 — Specialized AI Agents
--
-- 2 new tables:
--   - agent_configurations  per-agent config: prompts, budget caps, rate limits
--   - agent_outputs         polymorphic output storage with operator review
--
-- Pre-populates agent_configurations with defaults for all 12 agents.
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) agent_configurations
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_configurations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "agent_key" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,

  "agent_type" TEXT NOT NULL CHECK ("agent_type" IN (
    'sales_assistant', 'photo_analyst', 'construction_supervisor',
    'investor_relations', 'distribution_preview', 'document_understanding',
    'whatsapp_intent', 'qs_cost_analyst', 'procurement_analyst',
    'tax_assistant', 'marketing_assistant', 'executive_business',
    'daily_digest', 'weekly_plan'
  )),

  "preferred_provider" TEXT NOT NULL DEFAULT 'anthropic',
  "preferred_model" TEXT,
  "fallback_provider" TEXT,

  "system_prompt" TEXT NOT NULL,
  "user_prompt_template" TEXT NOT NULL,

  "expected_output_schema" JSONB,

  "daily_budget_minor" BIGINT NOT NULL DEFAULT 0,
  "monthly_budget_minor" BIGINT NOT NULL DEFAULT 0,
  "per_invocation_budget_minor" BIGINT NOT NULL DEFAULT 0,
  "budget_currency" TEXT NOT NULL DEFAULT 'USD',

  "max_invocations_per_hour" INTEGER,
  "max_invocations_per_day" INTEGER,

  "requires_operator_review" BOOLEAN NOT NULL DEFAULT TRUE,
  "operator_review_threshold_minor" BIGINT,

  "uses_memory" BOOLEAN NOT NULL DEFAULT TRUE,
  "memory_types_relevant" TEXT[] NOT NULL DEFAULT '{}',
  "max_memory_items_loaded" INTEGER NOT NULL DEFAULT 20,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "enabled_in_dry_run" BOOLEAN NOT NULL DEFAULT TRUE,

  "prompt_version" TEXT NOT NULL DEFAULT 'v1.0',

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_configurations_active_idx"
  ON "agent_configurations"("is_active");
CREATE INDEX IF NOT EXISTS "agent_configurations_type_idx"
  ON "agent_configurations"("agent_type");

CREATE OR REPLACE FUNCTION "agent_configurations_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_agent_configurations_updated_at" ON "agent_configurations";
CREATE TRIGGER "trg_agent_configurations_updated_at"
  BEFORE UPDATE ON "agent_configurations"
  FOR EACH ROW EXECUTE FUNCTION "agent_configurations_set_updated_at"();


-- =============================================================================
-- 2) Pre-populate agent_configurations for all 12 agents (idempotent)
-- =============================================================================

INSERT INTO "agent_configurations" (
  agent_key, display_name, description, agent_type,
  system_prompt, user_prompt_template,
  daily_budget_minor, monthly_budget_minor, per_invocation_budget_minor,
  max_invocations_per_hour, max_invocations_per_day,
  requires_operator_review, memory_types_relevant
) VALUES
  -- 7 existing agents
  ('sales_assistant', 'AI Sales Assistant', 'Helps qualify leads and draft outreach.', 'sales_assistant',
   'You are a sales co-pilot for a Bali villa developer.', 'Lead context: {{context}}',
   500, 15000, 50, 30, 200, TRUE, ARRAY['communication_pattern']),
  ('photo_analyst', 'AI Photo Analyst', 'Vision analysis of construction site photos.', 'photo_analyst',
   'You are a construction QA assistant analysing site photos.', 'Photo: {{photo}}',
   1000, 30000, 100, 60, 400, TRUE, ARRAY['quality_observation', 'site_condition']),
  ('construction_supervisor', 'AI Construction Supervisor', 'Generates daily construction supervision recommendations.', 'construction_supervisor',
   'You are an experienced site supervisor.', 'Project: {{project}}',
   800, 25000, 80, 24, 96, TRUE, ARRAY['schedule_pattern', 'team_observation']),
  ('investor_relations', 'AI Investor Relations', 'Drafts investor communications.', 'investor_relations',
   'You are an investor relations specialist.', 'Investor: {{investor}}',
   500, 15000, 50, 12, 50, TRUE, ARRAY['communication_pattern']),
  ('distribution_preview', 'AI Distribution Preview', 'Suggests distribution preview for investors.', 'distribution_preview',
   'You are a finance analyst preparing investor distributions.', 'Project: {{project}}',
   300, 9000, 30, 4, 12, TRUE, ARRAY['cost_pattern']),
  ('document_understanding', 'AI Document Understanding', 'Extracts structured data from invoices and contracts.', 'document_understanding',
   'You are a document parsing expert.', 'Document: {{document}}',
   2000, 60000, 150, 60, 600, TRUE, ARRAY['supplier_pattern']),
  ('whatsapp_intent', 'AI WhatsApp Intent Classifier', 'Classifies WhatsApp message intent.', 'whatsapp_intent',
   'You classify Bahasa/English WhatsApp messages by intent.', 'Message: {{message}}',
   500, 15000, 20, 120, 800, FALSE, ARRAY['communication_pattern']),

  -- 5 new specialized agents (5.D.2 + 5.D.3)
  ('qs_cost_analyst', 'AI QS Cost Analyst', 'Analyses cost overruns + forecasts at completion.', 'qs_cost_analyst',
   'You are an experienced quantity surveyor for villa developments in Bali.',
   'Project: {{project}}, scope: {{scope}}, timeframe: {{timeframe}}.',
   1500, 45000, 200, 6, 24, TRUE, ARRAY['cost_pattern', 'supplier_pattern', 'design_evolution']),
  ('procurement_analyst', 'AI Procurement Analyst', 'Vendor reliability + lead-time analysis.', 'procurement_analyst',
   'You are a procurement analyst tracking supplier performance.',
   'Project: {{project}}, vendor scope: {{vendorScope}}.',
   800, 24000, 100, 6, 24, TRUE, ARRAY['supplier_pattern']),
  ('tax_assistant', 'AI Tax Assistant', 'Auto-classification + period close readiness.', 'tax_assistant',
   'You are an Indonesian tax compliance specialist.',
   'Transactions: {{transactions}}, period: {{period}}.',
   1000, 30000, 50, 30, 200, TRUE, ARRAY['cost_pattern', 'regulatory_note']),
  ('marketing_assistant', 'AI Marketing Assistant', 'Captions, hashtags, broadcast templates.', 'marketing_assistant',
   'You are a luxury real-estate marketing copywriter.',
   'Project: {{project}}, content type: {{contentType}}, language: {{language}}.',
   500, 15000, 50, 30, 200, TRUE, ARRAY['communication_pattern', 'design_evolution']),
  ('executive_business', 'AI Executive Business Analyst', 'Strategic synthesis + weekly executive summary.', 'executive_business',
   'You are a strategic business analyst for a real-estate developer.',
   'Period: {{period}}, snapshot: {{snapshot}}.',
   2000, 60000, 300, 4, 12, TRUE,
   ARRAY['cost_pattern','supplier_pattern','schedule_pattern','team_observation','risk_observation','communication_pattern','site_condition','regulatory_note','design_evolution','quality_observation']),

  -- 2 recurring agents (5.D.4)
  ('daily_digest', 'AI Daily Construction Digest', 'End-of-day per-project digest.', 'daily_digest',
   'You are a site engineer summarising the day for the PM.',
   'Date: {{date}}, project: {{project}}.',
   1500, 45000, 100, 2, 8, TRUE,
   ARRAY['quality_observation','schedule_pattern','team_observation','site_condition']),
  ('weekly_plan', 'AI Weekly Construction Plan', 'Sunday-evening forward-looking weekly plan.', 'weekly_plan',
   'You are a construction PM planning the week ahead.',
   'Week starting {{weekStart}}, project: {{project}}.',
   2000, 60000, 200, 1, 4, TRUE,
   ARRAY['schedule_pattern','supplier_pattern','team_observation','cost_pattern'])
ON CONFLICT (agent_key) DO NOTHING;


-- =============================================================================
-- 3) agent_outputs
-- =============================================================================

CREATE TABLE IF NOT EXISTS "agent_outputs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "output_code" TEXT UNIQUE NOT NULL,
  "agent_key" TEXT NOT NULL,
  "invocation_log_id" UUID REFERENCES "agent_invocation_log"("id"),

  "project_id" UUID REFERENCES "projects"("id"),
  "scope_entity_type" TEXT,
  "scope_entity_id" UUID,

  "output_category" TEXT NOT NULL,

  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "detailed_output" JSONB NOT NULL,

  "recommended_actions" TEXT[] NOT NULL DEFAULT '{}',
  "affected_entities" JSONB,

  "confidence_level" TEXT,
  "reasoning_summary" TEXT,

  "status" TEXT NOT NULL DEFAULT 'awaiting_review' CHECK ("status" IN (
    'awaiting_review', 'approved', 'partially_approved',
    'rejected', 'edited_and_approved', 'expired'
  )),
  "reviewed_by" UUID REFERENCES "app_users"("id"),
  "reviewed_at" TIMESTAMPTZ,
  "reviewer_notes" TEXT,
  "edited_summary" TEXT,
  "edited_actions" TEXT[],

  "actions_executed" BOOLEAN NOT NULL DEFAULT FALSE,
  "actions_executed_at" TIMESTAMPTZ,
  "actions_executed_by" UUID REFERENCES "app_users"("id"),
  "action_results" JSONB,

  "expires_at" TIMESTAMPTZ,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_outputs_agent_idx"
  ON "agent_outputs"("agent_key");
CREATE INDEX IF NOT EXISTS "agent_outputs_status_idx"
  ON "agent_outputs"("status");
CREATE INDEX IF NOT EXISTS "agent_outputs_project_idx"
  ON "agent_outputs"("project_id");
CREATE INDEX IF NOT EXISTS "agent_outputs_created_idx"
  ON "agent_outputs"("created_at" DESC);

CREATE OR REPLACE FUNCTION "agent_outputs_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_agent_outputs_updated_at" ON "agent_outputs";
CREATE TRIGGER "trg_agent_outputs_updated_at"
  BEFORE UPDATE ON "agent_outputs"
  FOR EACH ROW EXECUTE FUNCTION "agent_outputs_set_updated_at"();


-- =============================================================================
-- 4) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['agent_configurations', 'agent_outputs'])
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
