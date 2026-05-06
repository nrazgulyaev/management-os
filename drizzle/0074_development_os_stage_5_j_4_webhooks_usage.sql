-- =============================================================================
-- 0074 — Development OS · Stage 5.J.4 — Webhooks + Usage + Data Export
--
-- 4 new tables:
--   - webhook_subscriptions  per-org HMAC-signed webhook endpoints
--   - webhook_delivery_log   per-attempt delivery audit
--   - usage_metrics          per-org daily/weekly/monthly snapshots
--   - data_export_requests   GDPR-compliant org data export
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) webhook_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "webhook_label" TEXT NOT NULL,
  "endpoint_url" TEXT NOT NULL,
  "signing_secret" TEXT NOT NULL,

  "subscribed_events" TEXT[] NOT NULL,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,

  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_successful_delivery_at" TIMESTAMPTZ,
  "last_failure_at" TIMESTAMPTZ,
  "last_failure_reason" TEXT,
  "auto_disabled_at" TIMESTAMPTZ,

  "created_by" UUID REFERENCES "app_users"("id"),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "webhook_subscriptions_organization_idx"
  ON "webhook_subscriptions"("organization_id");
CREATE INDEX IF NOT EXISTS "webhook_subscriptions_active_idx"
  ON "webhook_subscriptions"("is_active") WHERE "is_active" = TRUE;

CREATE OR REPLACE FUNCTION "webhook_subscriptions_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_webhook_subscriptions_updated_at" ON "webhook_subscriptions";
CREATE TRIGGER "trg_webhook_subscriptions_updated_at"
  BEFORE UPDATE ON "webhook_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "webhook_subscriptions_set_updated_at"();


-- =============================================================================
-- 2) webhook_delivery_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS "webhook_delivery_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "webhook_subscription_id" UUID NOT NULL
    REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE,

  "event_type" TEXT NOT NULL,
  "event_id" UUID NOT NULL,
  "event_payload" JSONB NOT NULL,

  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'delivering', 'delivered', 'failed', 'expired', 'cancelled'
  )),

  "http_status_code" INTEGER,
  "response_body" TEXT,
  "response_headers" JSONB,
  "duration_ms" INTEGER,

  "scheduled_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "delivered_at" TIMESTAMPTZ,
  "next_retry_at" TIMESTAMPTZ,

  "error_message" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "webhook_delivery_log_subscription_idx"
  ON "webhook_delivery_log"("webhook_subscription_id");
CREATE INDEX IF NOT EXISTS "webhook_delivery_log_status_idx"
  ON "webhook_delivery_log"("status");
CREATE INDEX IF NOT EXISTS "webhook_delivery_log_pending_idx"
  ON "webhook_delivery_log"("scheduled_at") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "webhook_delivery_log_event_idx"
  ON "webhook_delivery_log"("event_type");

CREATE OR REPLACE FUNCTION "webhook_delivery_log_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_webhook_delivery_log_updated_at" ON "webhook_delivery_log";
CREATE TRIGGER "trg_webhook_delivery_log_updated_at"
  BEFORE UPDATE ON "webhook_delivery_log"
  FOR EACH ROW EXECUTE FUNCTION "webhook_delivery_log_set_updated_at"();


-- =============================================================================
-- 3) usage_metrics
-- =============================================================================

CREATE TABLE IF NOT EXISTS "usage_metrics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "metric_period_start" DATE NOT NULL,
  "metric_period_end" DATE NOT NULL,
  "metric_type" TEXT NOT NULL CHECK ("metric_type" IN (
    'daily_summary', 'weekly_summary', 'monthly_summary'
  )),

  "active_users_count" INTEGER NOT NULL DEFAULT 0,
  "active_projects_count" INTEGER NOT NULL DEFAULT 0,
  "total_transactions_count" INTEGER NOT NULL DEFAULT 0,
  "total_invoices_count" INTEGER NOT NULL DEFAULT 0,
  "total_documents_uploaded" INTEGER NOT NULL DEFAULT 0,
  "total_storage_used_bytes" BIGINT NOT NULL DEFAULT 0,

  "ai_invocations_count" INTEGER NOT NULL DEFAULT 0,
  "ai_tokens_consumed" BIGINT NOT NULL DEFAULT 0,
  "ai_cost_minor" BIGINT NOT NULL DEFAULT 0,

  "api_requests_count" INTEGER NOT NULL DEFAULT 0,
  "api_rate_limited_count" INTEGER NOT NULL DEFAULT 0,

  "webhooks_dispatched_count" INTEGER NOT NULL DEFAULT 0,
  "webhooks_failed_count" INTEGER NOT NULL DEFAULT 0,

  "push_notifications_dispatched" INTEGER NOT NULL DEFAULT 0,

  "computed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("organization_id", "metric_period_start", "metric_period_end", "metric_type")
);

CREATE INDEX IF NOT EXISTS "usage_metrics_organization_idx" ON "usage_metrics"("organization_id");
CREATE INDEX IF NOT EXISTS "usage_metrics_period_idx"
  ON "usage_metrics"("metric_period_start", "metric_period_end");


-- =============================================================================
-- 4) data_export_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS "data_export_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "requested_by" UUID NOT NULL REFERENCES "app_users"("id"),

  "export_scope" TEXT NOT NULL CHECK ("export_scope" IN (
    'full_organization', 'projects_only', 'financial_data',
    'investor_data', 'sales_data', 'custom'
  )),
  "custom_tables" TEXT[],

  "export_format" TEXT NOT NULL DEFAULT 'json' CHECK ("export_format" IN (
    'json', 'csv', 'sql'
  )),

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'processing', 'completed', 'failed', 'expired'
  )),

  "output_document_id" UUID REFERENCES "documents"("id"),
  "output_size_bytes" BIGINT,
  "download_url" TEXT,
  "download_expires_at" TIMESTAMPTZ,
  "download_count" INTEGER NOT NULL DEFAULT 0,

  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,

  "error_message" TEXT,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "data_export_requests_organization_idx"
  ON "data_export_requests"("organization_id");
CREATE INDEX IF NOT EXISTS "data_export_requests_status_idx"
  ON "data_export_requests"("status");

CREATE OR REPLACE FUNCTION "data_export_requests_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_data_export_requests_updated_at" ON "data_export_requests";
CREATE TRIGGER "trg_data_export_requests_updated_at"
  BEFORE UPDATE ON "data_export_requests"
  FOR EACH ROW EXECUTE FUNCTION "data_export_requests_set_updated_at"();


-- =============================================================================
-- 5) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'webhook_subscriptions', 'webhook_delivery_log',
      'usage_metrics', 'data_export_requests'
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
