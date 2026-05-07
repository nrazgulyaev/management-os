-- =============================================================================
-- 0082 — Development OS · Stage 6.P4.A — Marketing + Analytics Foundation
--
-- 5 new tables — marketing core for Stage 6.P4:
--   - marketing_connections      per-platform integration config (GA4,
--                                Google Ads, Meta Pixel, Meta Ads, TikTok,
--                                Mailchimp, ConvertKit, manual). Encrypted
--                                credentials, sync cadence + status.
--   - marketing_campaigns        campaigns pulled from ad platforms, keyed
--                                by (connection, external_campaign_id) for
--                                idempotent re-sync.
--   - marketing_metrics          daily per-campaign metrics — spend (in
--                                minor units after provider mappers
--                                normalize from micros / major / etc.),
--                                impressions, clicks, conversions, ROAS.
--                                UNIQUE (campaign, metric_date).
--   - attribution_touchpoints    UTM + referrer telemetry, one row per
--                                inbound visitor session. Identity carried
--                                via session_id + client_id; linked to
--                                contacts when available.
--   - attribution_conversions    completed conversion events (lead created,
--                                reservation booked, deal closed, etc.).
--                                Holds the engine's first-touch /
--                                last-touch / linear-attribution result.
--
-- RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
-- Uses FOREACH IN ARRAY (4th preservation of the migration 0075 lesson).
--
-- Trigger function (`marketing_set_updated_at`) is distinct from the
-- banking + messaging variants so a cross-stage rollback can drop one
-- without orphaning the others.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) marketing_connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "marketing_connections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "provider" TEXT NOT NULL CHECK ("provider" IN (
    'google_analytics', 'google_ads', 'meta_pixel', 'meta_ads',
    'tiktok_ads', 'mailchimp', 'convertkit', 'sendgrid_marketing',
    'manual', 'other'
  )),

  "external_account_id" TEXT NOT NULL,
  "account_name" TEXT,

  -- Credentials encrypted via STAY_LINK_KMS_SECRET (P1.B helper).
  "credentials" JSONB,

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'connecting', 'active', 'paused', 'error', 'archived'
  )),

  -- Sync cadence — analytics + ad-platform pulls are aggregate data
  -- and don't need to be real-time. Default 6h.
  "auto_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sync_frequency_minutes" INTEGER NOT NULL DEFAULT 360,
  "last_synced_at" TIMESTAMPTZ,
  "last_sync_status" TEXT,
  "last_sync_error" TEXT,
  "last_sync_records_pulled" INTEGER,

  -- Audit.
  "connected_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "connected_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "archive_reason" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("organization_id", "provider", "external_account_id")
);

CREATE INDEX IF NOT EXISTS "marketing_connections_org_idx"
  ON "marketing_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "marketing_connections_provider_idx"
  ON "marketing_connections"("provider");
CREATE INDEX IF NOT EXISTS "marketing_connections_active_idx"
  ON "marketing_connections"("status") WHERE "status" = 'active';

-- -----------------------------------------------------------------------------
-- 2) marketing_campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "marketing_connection_id" UUID NOT NULL REFERENCES "marketing_connections"("id") ON DELETE CASCADE,

  -- External identification — idempotency key when paired with
  -- the connection.
  "external_campaign_id" TEXT NOT NULL,
  "campaign_name" TEXT NOT NULL,

  "platform" TEXT NOT NULL,
  "campaign_type" TEXT,
  "campaign_objective" TEXT,

  "status" TEXT NOT NULL CHECK ("status" IN (
    'active', 'paused', 'completed', 'draft', 'archived', 'unknown'
  )),

  "start_date" DATE,
  "end_date" DATE,

  "budget_minor" BIGINT,
  "budget_currency" TEXT,
  "budget_type" TEXT,

  "targeting_summary" JSONB,
  "raw_payload" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("marketing_connection_id", "external_campaign_id")
);

CREATE INDEX IF NOT EXISTS "marketing_campaigns_connection_idx"
  ON "marketing_campaigns"("marketing_connection_id");
CREATE INDEX IF NOT EXISTS "marketing_campaigns_status_idx"
  ON "marketing_campaigns"("status");
CREATE INDEX IF NOT EXISTS "marketing_campaigns_org_idx"
  ON "marketing_campaigns"("organization_id");

-- -----------------------------------------------------------------------------
-- 3) marketing_metrics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "marketing_metrics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" UUID NOT NULL REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE,

  "metric_date" DATE NOT NULL,

  -- Spend in minor units (cents). Provider mappers normalize from
  -- micros / major / etc. before insert — DB never sees native units.
  "spend_minor" BIGINT NOT NULL DEFAULT 0,
  "spend_currency" TEXT NOT NULL,

  -- Top-funnel.
  "impressions" BIGINT NOT NULL DEFAULT 0,
  "reach" BIGINT,
  "frequency" NUMERIC(8, 4),

  -- Mid-funnel.
  "clicks" BIGINT NOT NULL DEFAULT 0,
  "click_through_rate" NUMERIC(8, 6),
  "cost_per_click_minor" BIGINT,

  -- Conversions.
  "conversions" BIGINT NOT NULL DEFAULT 0,
  "conversion_value_minor" BIGINT NOT NULL DEFAULT 0,
  "cost_per_conversion_minor" BIGINT,
  "return_on_ad_spend" NUMERIC(8, 4),

  -- Engagement (social).
  "engagements" BIGINT,
  "video_views" BIGINT,
  "video_watch_time_seconds" BIGINT,

  "quality_score" NUMERIC(3, 2),

  "raw_metrics" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: same (campaign, date) can't be ingested twice.
  UNIQUE ("campaign_id", "metric_date")
);

CREATE INDEX IF NOT EXISTS "marketing_metrics_campaign_idx"
  ON "marketing_metrics"("campaign_id");
CREATE INDEX IF NOT EXISTS "marketing_metrics_date_idx"
  ON "marketing_metrics"("metric_date" DESC);
CREATE INDEX IF NOT EXISTS "marketing_metrics_org_idx"
  ON "marketing_metrics"("organization_id");

-- -----------------------------------------------------------------------------
-- 4) attribution_touchpoints
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "attribution_touchpoints" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Identity. session_id is per-visit; client_id is per-device
  -- (GA4 client_id / Meta _fbp). user_external_id when authed.
  "session_id" TEXT,
  "client_id" TEXT,
  "user_external_id" TEXT,

  -- Linked records (when stitchable).
  "contact_id" UUID REFERENCES "contacts"("id") ON DELETE SET NULL,

  "touchpoint_at" TIMESTAMPTZ NOT NULL,

  -- Channel classification — output of the UTM tracker's
  -- classifyChannel() helper.
  "channel" TEXT NOT NULL CHECK ("channel" IN (
    'organic_search', 'paid_search', 'organic_social', 'paid_social',
    'email', 'direct', 'referral', 'display', 'video', 'affiliate', 'other'
  )),

  -- Raw UTM signal preserved alongside the classified channel.
  "source" TEXT,
  "medium" TEXT,
  "campaign" TEXT,
  "content" TEXT,
  "term" TEXT,
  "referrer_url" TEXT,
  "landing_url" TEXT,

  -- Linked campaign — populated by the attribution engine when the
  -- UTM `campaign` matches a `marketing_campaigns` row's name.
  "campaign_id" UUID REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL,

  "user_agent" TEXT,
  "device_type" TEXT,
  "country" TEXT,
  "raw_payload" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "attribution_touchpoints_session_idx"
  ON "attribution_touchpoints"("session_id");
CREATE INDEX IF NOT EXISTS "attribution_touchpoints_client_idx"
  ON "attribution_touchpoints"("client_id");
CREATE INDEX IF NOT EXISTS "attribution_touchpoints_contact_idx"
  ON "attribution_touchpoints"("contact_id")
  WHERE "contact_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "attribution_touchpoints_at_idx"
  ON "attribution_touchpoints"("touchpoint_at" DESC);
CREATE INDEX IF NOT EXISTS "attribution_touchpoints_org_idx"
  ON "attribution_touchpoints"("organization_id");

-- -----------------------------------------------------------------------------
-- 5) attribution_conversions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "attribution_conversions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "conversion_type" TEXT NOT NULL CHECK ("conversion_type" IN (
    'lead_created', 'reservation_booked', 'deal_closed',
    'investor_committed', 'newsletter_signup', 'inquiry_submitted',
    'tour_scheduled', 'custom'
  )),

  -- Linked records — soft links because the target tables live in
  -- different schema modules (sales, bookings, investor_capital,
  -- etc.). The engine joins by ID + cross-references at query time.
  "contact_id" UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "linked_reservation_id" UUID,
  "linked_deal_id" UUID,
  "linked_lead_id" UUID,

  "conversion_value_minor" BIGINT,
  "conversion_currency" TEXT,

  "converted_at" TIMESTAMPTZ NOT NULL,

  -- Attribution result — populated by the engine. Allowed to be
  -- NULL until the engine has run for this conversion.
  "first_touch_campaign_id" UUID REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL,
  "last_touch_campaign_id" UUID REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL,
  "linear_attribution_data" JSONB,

  "days_to_convert" INTEGER,
  "touchpoint_count" INTEGER,

  "metadata" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "attribution_conversions_org_idx"
  ON "attribution_conversions"("organization_id");
CREATE INDEX IF NOT EXISTS "attribution_conversions_at_idx"
  ON "attribution_conversions"("converted_at" DESC);
CREATE INDEX IF NOT EXISTS "attribution_conversions_type_idx"
  ON "attribution_conversions"("conversion_type");
CREATE INDEX IF NOT EXISTS "attribution_conversions_contact_idx"
  ON "attribution_conversions"("contact_id")
  WHERE "contact_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6) updated_at trigger function (kept distinct from banking variant)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "marketing_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_marketing_connections_updated_at" ON "marketing_connections";
CREATE TRIGGER "trg_marketing_connections_updated_at"
  BEFORE UPDATE ON "marketing_connections"
  FOR EACH ROW EXECUTE FUNCTION "marketing_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_marketing_campaigns_updated_at" ON "marketing_campaigns";
CREATE TRIGGER "trg_marketing_campaigns_updated_at"
  BEFORE UPDATE ON "marketing_campaigns"
  FOR EACH ROW EXECUTE FUNCTION "marketing_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_marketing_metrics_updated_at" ON "marketing_metrics";
CREATE TRIGGER "trg_marketing_metrics_updated_at"
  BEFORE UPDATE ON "marketing_metrics"
  FOR EACH ROW EXECUTE FUNCTION "marketing_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_attribution_conversions_updated_at" ON "attribution_conversions";
CREATE TRIGGER "trg_attribution_conversions_updated_at"
  BEFORE UPDATE ON "attribution_conversions"
  FOR EACH ROW EXECUTE FUNCTION "marketing_set_updated_at"();

-- attribution_touchpoints is append-only — no updated_at column /
-- trigger.

-- -----------------------------------------------------------------------------
-- 7) RLS — per-org isolation via is_in_user_organization() (Stage 5.J helper).
--
-- Uses FOREACH t IN ARRAY ARRAY[...] per the migration 0075 lesson —
-- Postgres versions vary on FOR ... IN SELECT unnest(...) syntax.
-- Tests assert this pattern explicitly so future contributors can't
-- regress it. (4th preservation across migrations.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_connections',
    'marketing_campaigns',
    'marketing_metrics',
    'attribution_touchpoints',
    'attribution_conversions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
