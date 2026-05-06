-- =============================================================================
-- 0044 — Development OS · Stage 3.D — WhatsApp Integration
--
-- Four new internal-only RLS tables for WhatsApp:
--   - whatsapp_phone_numbers     registry of all known phones (Arconique
--                                outbound, recipient, unknown).
--   - whatsapp_messages          append-only log of inbound + outbound.
--   - whatsapp_message_templates pre-approved templates for outbound.
--   - whatsapp_webhook_events    audit log of every webhook hit (inc.
--                                rejections — invalid signature, replay).
--
-- Plus channel-preference columns on app_users / investors / contacts
-- and one new agent budget for the lightweight intent classifier.
--
-- All HITL: inbound creates DRAFT entities, never auto-acts on financial
-- surfaces. Webhook MUST verify signatures (mandatory at the application
-- layer; rejections logged).
--
-- Idempotent. Wrapped in BEGIN ... COMMIT.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) whatsapp_phone_numbers
-- =============================================================================
CREATE TABLE IF NOT EXISTS "whatsapp_phone_numbers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone_number" TEXT UNIQUE NOT NULL,
  "display_name" TEXT,

  "number_type" TEXT NOT NULL,
  "project_id" UUID REFERENCES "projects"("id") ON DELETE SET NULL,

  -- Recipient resolution (for known external numbers).
  "resolved_entity_type" TEXT,
  "resolved_entity_id" UUID,

  "provider" TEXT NOT NULL DEFAULT 'twilio',
  "twilio_phone_sid" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "verified_at" TIMESTAMPTZ,

  "last_message_at" TIMESTAMPTZ,
  "total_messages_sent" INTEGER NOT NULL DEFAULT 0,
  "total_messages_received" INTEGER NOT NULL DEFAULT 0,

  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "whatsapp_phone_numbers_type_check"
    CHECK ("number_type" IN (
      'arconique_outbound', 'arconique_inbound', 'recipient', 'unknown'
    )),
  CONSTRAINT "whatsapp_phone_numbers_entity_type_check"
    CHECK ("resolved_entity_type" IS NULL OR "resolved_entity_type" IN (
      'app_user', 'investor', 'vendor', 'contact'
    )),
  CONSTRAINT "whatsapp_phone_numbers_provider_check"
    CHECK ("provider" IN ('twilio', 'meta_cloud', 'sandbox', 'dry_run'))
);

CREATE INDEX IF NOT EXISTS "whatsapp_phone_numbers_active_idx"
  ON "whatsapp_phone_numbers" ("is_active");
CREATE INDEX IF NOT EXISTS "whatsapp_phone_numbers_type_idx"
  ON "whatsapp_phone_numbers" ("number_type");
CREATE INDEX IF NOT EXISTS "whatsapp_phone_numbers_entity_idx"
  ON "whatsapp_phone_numbers" ("resolved_entity_type", "resolved_entity_id");
CREATE INDEX IF NOT EXISTS "whatsapp_phone_numbers_project_idx"
  ON "whatsapp_phone_numbers" ("project_id");

-- =============================================================================
-- 2) whatsapp_messages — append-only log
-- =============================================================================
CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "provider" TEXT NOT NULL,
  "external_message_sid" TEXT,

  "direction" TEXT NOT NULL,
  "from_phone" TEXT NOT NULL,
  "to_phone" TEXT NOT NULL,

  "from_phone_id" UUID REFERENCES "whatsapp_phone_numbers"("id")
    ON DELETE SET NULL,
  "to_phone_id" UUID REFERENCES "whatsapp_phone_numbers"("id")
    ON DELETE SET NULL,

  "message_type" TEXT NOT NULL,
  "body" TEXT,
  "media_urls" TEXT[],
  "template_name" TEXT,
  "template_variables" JSONB,

  "voice_transcript" TEXT,
  "voice_transcript_language" TEXT,
  "voice_transcribed_at" TIMESTAMPTZ,

  "status" TEXT NOT NULL DEFAULT 'received',
  "status_updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "failure_reason" TEXT,

  -- AI processing (for inbound)
  "ai_processed_at" TIMESTAMPTZ,
  "ai_intent" TEXT,
  "ai_intent_confidence" NUMERIC(3, 2),
  "ai_run_id" UUID REFERENCES "ai_assistant_runs"("id") ON DELETE SET NULL,

  -- Linked entities created from this message (HITL drafts).
  "created_site_report_id" UUID REFERENCES "site_reports"("id")
    ON DELETE SET NULL,
  "created_investor_qa_id" UUID,

  -- Linked notification dispatch (for outbound).
  "delivery_log_id" UUID REFERENCES "dev_notification_delivery_log"("id")
    ON DELETE SET NULL,

  -- Webhook context (for inbound).
  "webhook_received_at" TIMESTAMPTZ,
  "webhook_signature_verified" BOOLEAN,
  "webhook_raw_payload" JSONB,

  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "whatsapp_messages_direction_check"
    CHECK ("direction" IN ('inbound', 'outbound')),
  CONSTRAINT "whatsapp_messages_type_check"
    CHECK ("message_type" IN (
      'text', 'voice', 'image', 'document', 'video', 'location', 'template'
    )),
  CONSTRAINT "whatsapp_messages_status_check"
    CHECK ("status" IN (
      'received', 'queued', 'sent', 'delivered', 'read', 'failed', 'processed'
    )),
  CONSTRAINT "whatsapp_messages_intent_check"
    CHECK ("ai_intent" IS NULL OR "ai_intent" IN (
      'site_report', 'safety_alert', 'vendor_inquiry',
      'investor_question', 'unknown'
    )),
  CONSTRAINT "whatsapp_messages_intent_conf_check"
    CHECK ("ai_intent_confidence" IS NULL OR
           "ai_intent_confidence" BETWEEN 0 AND 1)
);

-- Replay protection: external_message_sid is unique per provider when
-- present. Inbound webhooks dedupe by (provider, external_message_sid).
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_provider_sid_unique"
  ON "whatsapp_messages" ("provider", "external_message_sid")
  WHERE "external_message_sid" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_messages_external_sid_idx"
  ON "whatsapp_messages" ("external_message_sid");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_direction_idx"
  ON "whatsapp_messages" ("direction");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_idx"
  ON "whatsapp_messages" ("status");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_intent_idx"
  ON "whatsapp_messages" ("ai_intent");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_from_phone_idx"
  ON "whatsapp_messages" ("from_phone_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_to_phone_idx"
  ON "whatsapp_messages" ("to_phone_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_occurred_idx"
  ON "whatsapp_messages" ("occurred_at" DESC);

-- =============================================================================
-- 3) whatsapp_message_templates
-- =============================================================================
CREATE TABLE IF NOT EXISTS "whatsapp_message_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_key" TEXT UNIQUE NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,

  "language_versions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "expected_variables" TEXT[],

  "twilio_template_sid" TEXT,
  "meta_template_id" TEXT,

  "approval_status" TEXT NOT NULL DEFAULT 'draft',
  "approved_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,

  "notification_event_type" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "created_by" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "whatsapp_message_templates_status_check"
    CHECK ("approval_status" IN (
      'draft', 'pending_approval', 'approved', 'rejected', 'inactive'
    ))
);

CREATE INDEX IF NOT EXISTS "whatsapp_message_templates_key_idx"
  ON "whatsapp_message_templates" ("template_key");
CREATE INDEX IF NOT EXISTS "whatsapp_message_templates_status_idx"
  ON "whatsapp_message_templates" ("approval_status");
CREATE INDEX IF NOT EXISTS "whatsapp_message_templates_event_idx"
  ON "whatsapp_message_templates" ("notification_event_type");

-- =============================================================================
-- 4) whatsapp_webhook_events — audit log
-- =============================================================================
CREATE TABLE IF NOT EXISTS "whatsapp_webhook_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "provider" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,

  "signature_provided" TEXT,
  "signature_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "source_ip" TEXT,

  "raw_payload" JSONB NOT NULL,

  "processed_at" TIMESTAMPTZ,
  "processing_status" TEXT NOT NULL DEFAULT 'pending',
  "processing_error" TEXT,
  "related_message_id" UUID REFERENCES "whatsapp_messages"("id")
    ON DELETE SET NULL,

  "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "whatsapp_webhook_events_status_check"
    CHECK ("processing_status" IN (
      'pending', 'processed', 'failed',
      'rejected_invalid_signature', 'rejected_replay'
    ))
);

CREATE INDEX IF NOT EXISTS "whatsapp_webhook_events_received_idx"
  ON "whatsapp_webhook_events" ("received_at" DESC);
CREATE INDEX IF NOT EXISTS "whatsapp_webhook_events_status_idx"
  ON "whatsapp_webhook_events" ("processing_status");
CREATE INDEX IF NOT EXISTS "whatsapp_webhook_events_message_idx"
  ON "whatsapp_webhook_events" ("related_message_id");

-- =============================================================================
-- 5) Channel-preference columns on app_users / investors / contacts.
--   Defaults to FALSE so existing recipients keep getting email.
-- =============================================================================
ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "whatsapp_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "prefers_whatsapp" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "app_users_whatsapp_idx"
  ON "app_users" ("whatsapp_phone")
  WHERE "whatsapp_phone" IS NOT NULL;

ALTER TABLE "investors"
  ADD COLUMN IF NOT EXISTS "whatsapp_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "prefers_whatsapp" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "investors_whatsapp_idx"
  ON "investors" ("whatsapp_phone")
  WHERE "whatsapp_phone" IS NOT NULL;

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "whatsapp_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "prefers_whatsapp" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "contacts_whatsapp_idx"
  ON "contacts" ("whatsapp_phone")
  WHERE "whatsapp_phone" IS NOT NULL;

-- =============================================================================
-- 6) RLS — internal-only on all four new tables.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'whatsapp_phone_numbers',
      'whatsapp_messages',
      'whatsapp_message_templates',
      'whatsapp_webhook_events'
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
-- 7) updated_at triggers (only on the long-lived tables).
-- =============================================================================
CREATE OR REPLACE FUNCTION "whatsapp_phone_numbers_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "whatsapp_phone_numbers_updated_at_trg"
  ON "whatsapp_phone_numbers";
CREATE TRIGGER "whatsapp_phone_numbers_updated_at_trg"
  BEFORE UPDATE ON "whatsapp_phone_numbers"
  FOR EACH ROW EXECUTE FUNCTION "whatsapp_phone_numbers_set_updated_at"();

CREATE OR REPLACE FUNCTION "whatsapp_messages_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "whatsapp_messages_updated_at_trg"
  ON "whatsapp_messages";
CREATE TRIGGER "whatsapp_messages_updated_at_trg"
  BEFORE UPDATE ON "whatsapp_messages"
  FOR EACH ROW EXECUTE FUNCTION "whatsapp_messages_set_updated_at"();

CREATE OR REPLACE FUNCTION "whatsapp_message_templates_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "whatsapp_message_templates_updated_at_trg"
  ON "whatsapp_message_templates";
CREATE TRIGGER "whatsapp_message_templates_updated_at_trg"
  BEFORE UPDATE ON "whatsapp_message_templates"
  FOR EACH ROW EXECUTE FUNCTION "whatsapp_message_templates_set_updated_at"();

-- =============================================================================
-- 8) New agent budget for the lightweight intent classifier.
-- =============================================================================
INSERT INTO "ai_agent_budgets" (
  "assistant_key", "daily_limit_usd", "monthly_limit_usd",
  "alert_threshold_pct", "is_enabled", "notes"
) VALUES
  ('dev_os.whatsapp_intent_classifier', '0.50', '10.00', 80, TRUE,
   'Lightweight per-message classification. Daily $0.50 ≈ 500 messages on Haiku 4.5.')
ON CONFLICT ("assistant_key") DO UPDATE SET
  "daily_limit_usd" = EXCLUDED."daily_limit_usd",
  "monthly_limit_usd" = EXCLUDED."monthly_limit_usd",
  "notes" = EXCLUDED."notes",
  "updated_at" = now();

COMMIT;
