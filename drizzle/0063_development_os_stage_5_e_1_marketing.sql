-- =============================================================================
-- 0063 — Development OS · Stage 5.E.1 — Marketing (lead sources + campaigns)
--
-- 4 new tables:
--   - lead_sources    marketing channel registry (14 default seeds)
--   - leads           NEW lightweight lead pipeline (no prior table)
--   - campaigns       marketing campaigns
--   - campaign_costs  per-period per-channel cost tracking
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) lead_sources
-- =============================================================================

CREATE TABLE IF NOT EXISTS "marketing_lead_sources" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "source_key" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,

  "channel_type" TEXT NOT NULL CHECK ("channel_type" IN (
    'paid_social', 'paid_search', 'organic_social', 'organic_search',
    'referral', 'direct', 'email', 'whatsapp', 'event',
    'partner', 'pr_media', 'word_of_mouth', 'other'
  )),
  "platform" TEXT,

  "is_paid" BOOLEAN NOT NULL DEFAULT FALSE,
  "default_attribution_model" TEXT CHECK ("default_attribution_model" IN (
    'first_touch', 'last_touch', 'linear', 'time_decay', 'position_based'
  )),

  "utm_source_default" TEXT,
  "utm_medium_default" TEXT,

  "has_external_cost_data" BOOLEAN NOT NULL DEFAULT FALSE,
  "cost_data_source" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "icon_key" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "marketing_lead_sources_active_idx" ON "marketing_lead_sources"("is_active");
CREATE INDEX IF NOT EXISTS "marketing_lead_sources_channel_idx" ON "marketing_lead_sources"("channel_type");

CREATE OR REPLACE FUNCTION "marketing_lead_sources_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_marketing_lead_sources_updated_at" ON "marketing_lead_sources";
CREATE TRIGGER "trg_marketing_lead_sources_updated_at"
  BEFORE UPDATE ON "marketing_lead_sources"
  FOR EACH ROW EXECUTE FUNCTION "marketing_lead_sources_set_updated_at"();

-- Seed default sources
INSERT INTO "marketing_lead_sources" (source_key, display_name, channel_type, platform, is_paid, default_attribution_model) VALUES
  ('meta_ads', 'Meta Ads', 'paid_social', 'meta', TRUE, 'last_touch'),
  ('google_ads', 'Google Ads', 'paid_search', 'google', TRUE, 'last_touch'),
  ('instagram_organic', 'Instagram Organic', 'organic_social', 'instagram', FALSE, 'first_touch'),
  ('tiktok_organic', 'TikTok Organic', 'organic_social', 'tiktok', FALSE, 'first_touch'),
  ('tiktok_ads', 'TikTok Ads', 'paid_social', 'tiktok', TRUE, 'last_touch'),
  ('youtube_organic', 'YouTube Organic', 'organic_social', 'youtube', FALSE, 'first_touch'),
  ('seo_organic', 'SEO Organic Search', 'organic_search', 'google', FALSE, 'first_touch'),
  ('referral', 'Referral', 'referral', NULL, FALSE, 'last_touch'),
  ('whatsapp_direct', 'WhatsApp Direct', 'whatsapp', NULL, FALSE, 'last_touch'),
  ('event_walkin', 'Event / Walk-in', 'event', NULL, FALSE, 'first_touch'),
  ('partner_referral', 'Partner Referral', 'partner', NULL, FALSE, 'last_touch'),
  ('press_media', 'Press / Media', 'pr_media', NULL, FALSE, 'first_touch'),
  ('email_campaign', 'Email Campaign', 'email', NULL, FALSE, 'last_touch'),
  ('direct_unknown', 'Direct / Unknown', 'direct', NULL, FALSE, 'last_touch')
ON CONFLICT (source_key) DO NOTHING;


-- =============================================================================
-- 2) campaigns
-- =============================================================================

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "campaign_code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,

  "project_ids" UUID[] NOT NULL DEFAULT '{}',
  "campaign_objective" TEXT NOT NULL CHECK ("campaign_objective" IN (
    'awareness', 'lead_generation', 'engagement', 'conversion',
    'retention', 'brand_building', 'launch', 'rebranding', 'event_promotion'
  )),

  "primary_channels" TEXT[] NOT NULL DEFAULT '{}',

  "total_budget_minor" BIGINT NOT NULL DEFAULT 0,
  "spent_to_date_minor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "campaign_start" DATE NOT NULL,
  "campaign_end" DATE NOT NULL,

  "target_audience_description" TEXT,
  "geographic_focus" TEXT[] NOT NULL DEFAULT '{}',
  "language_focus" TEXT[] NOT NULL DEFAULT '{}',

  "target_leads" INTEGER,
  "target_qualified_leads" INTEGER,
  "target_reservations" INTEGER,
  "target_revenue_minor" BIGINT,

  "status" TEXT NOT NULL DEFAULT 'planned' CHECK ("status" IN (
    'planned', 'in_preparation', 'active', 'paused', 'completed', 'cancelled', 'archived'
  )),

  "managed_by" UUID REFERENCES "app_users"("id"),

  "notes" TEXT,
  "internal_notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("campaign_end" >= "campaign_start")
);

CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX IF NOT EXISTS "campaigns_period_idx" ON "campaigns"("campaign_start", "campaign_end");
CREATE INDEX IF NOT EXISTS "campaigns_objective_idx" ON "campaigns"("campaign_objective");

CREATE OR REPLACE FUNCTION "campaigns_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_campaigns_updated_at" ON "campaigns";
CREATE TRIGGER "trg_campaigns_updated_at"
  BEFORE UPDATE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION "campaigns_set_updated_at"();


-- =============================================================================
-- 3) campaign_costs
-- =============================================================================

CREATE TABLE IF NOT EXISTS "campaign_costs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "campaign_id" UUID NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,

  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,

  "source_key" TEXT NOT NULL,

  "cost_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "impressions" INTEGER,
  "clicks" INTEGER,
  "conversions" INTEGER,
  "ctr" NUMERIC(7,4),
  "cpc" NUMERIC(15,2),

  "data_source" TEXT NOT NULL CHECK ("data_source" IN (
    'manual_entry', 'meta_api', 'google_ads_api', 'tiktok_ads_api', 'imported_csv'
  )),
  "imported_at" TIMESTAMPTZ,
  "source_record_id" TEXT,

  "related_transaction_id" UUID REFERENCES "dev_transactions"("id"),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK ("period_end" >= "period_start")
);

CREATE INDEX IF NOT EXISTS "campaign_costs_campaign_idx" ON "campaign_costs"("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_costs_source_idx" ON "campaign_costs"("source_key");
CREATE INDEX IF NOT EXISTS "campaign_costs_period_idx" ON "campaign_costs"("period_start", "period_end");

CREATE OR REPLACE FUNCTION "campaign_costs_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_campaign_costs_updated_at" ON "campaign_costs";
CREATE TRIGGER "trg_campaign_costs_updated_at"
  BEFORE UPDATE ON "campaign_costs"
  FOR EACH ROW EXECUTE FUNCTION "campaign_costs_set_updated_at"();


-- =============================================================================
-- 4) leads (NEW — no prior table existed)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "leads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "lead_code" TEXT UNIQUE NOT NULL,

  "contact_id" UUID REFERENCES "contacts"("id"),
  "project_id" UUID REFERENCES "projects"("id"),

  "lifecycle_status" TEXT NOT NULL DEFAULT 'lead' CHECK ("lifecycle_status" IN (
    'lead', 'qualified', 'hot', 'reservation', 'contract', 'closed_won',
    'closed_lost', 'on_hold', 'archived'
  )),
  "lifecycle_status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "assigned_manager_id" UUID REFERENCES "app_users"("id"),
  "assigned_at" TIMESTAMPTZ,

  -- Attribution
  "lead_source_key" TEXT REFERENCES "marketing_lead_sources"("source_key"),

  "first_touch_source_key" TEXT,
  "last_touch_source_key" TEXT,
  "attribution_path" JSONB,
  "campaign_id" UUID REFERENCES "campaigns"("id"),

  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "utm_content" TEXT,
  "utm_term" TEXT,

  "first_touch_at" TIMESTAMPTZ,
  "attribution_data" JSONB,

  "estimated_value_minor" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'IDR',

  "notes" TEXT,
  "internal_notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads"("lead_source_key");
CREATE INDEX IF NOT EXISTS "leads_campaign_idx" ON "leads"("campaign_id");
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads"("lifecycle_status");
CREATE INDEX IF NOT EXISTS "leads_manager_idx" ON "leads"("assigned_manager_id");
CREATE INDEX IF NOT EXISTS "leads_contact_idx" ON "leads"("contact_id");

CREATE OR REPLACE FUNCTION "leads_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_leads_updated_at" ON "leads";
CREATE TRIGGER "trg_leads_updated_at"
  BEFORE UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION "leads_set_updated_at"();


-- =============================================================================
-- 5) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['marketing_lead_sources', 'campaigns', 'campaign_costs', 'leads'])
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
