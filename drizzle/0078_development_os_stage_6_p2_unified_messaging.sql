-- =============================================================================
-- 0078 — Development OS · Stage 6.P2.A — Unified Messaging Foundation
--
-- 4 new tables:
--   - conversation_threads     unified threads across messaging channels
--                              (WhatsApp, Telegram, Instagram, Messenger,
--                              email, SMS, internal_note). Holds per-thread
--                              counters + assignment + tags. Links to
--                              `contacts` (existing platform table).
--   - conversation_messages    individual messages with channel, direction,
--                              content, status, raw_payload. Per-channel
--                              external_message_id is unique (idempotent
--                              ingestion under webhook + polling races).
--   - message_templates        reusable per-channel templates with variable
--                              substitution. WhatsApp Business templates
--                              track Meta approval state.
--   - auto_response_rules      keyword / first_message / after_hours /
--                              no_response_timeout triggers with action
--                              configs (send template / text / assign /
--                              tag). Throttled, prioritised.
--
-- RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
-- Uses FOREACH IN ARRAY (per the migration 0075 lesson — Postgres versions
-- vary on FOR ... IN SELECT unnest(...) syntax). Idempotent.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) conversation_threads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "conversation_threads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- Optional link to platform contact. Unmatched senders (no email/phone
  -- match) sit in threads with NULL contact_id until an operator links.
  "contact_id" UUID REFERENCES "contacts"("id") ON DELETE SET NULL,

  -- Channel inventory: which channels this thread has been used on.
  "channels_used" TEXT[] NOT NULL DEFAULT '{}',
  "primary_channel" TEXT,

  -- Per-channel external IDs the thread is identified by on each platform.
  -- Example: { "whatsapp": "+62812...", "telegram": "12345", "email": "..." }
  "external_identifiers" JSONB NOT NULL DEFAULT '{}'::jsonb,

  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN (
    'active', 'archived', 'spam', 'pending_assignment'
  )),

  "assigned_to_user_id" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "assigned_at" TIMESTAMPTZ,

  "total_messages" INTEGER NOT NULL DEFAULT 0,
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "last_message_at" TIMESTAMPTZ,
  "last_inbound_at" TIMESTAMPTZ,
  "last_outbound_at" TIMESTAMPTZ,

  "subject" TEXT,
  "tags" TEXT[],

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversation_threads_org_idx"
  ON "conversation_threads"("organization_id");
CREATE INDEX IF NOT EXISTS "conversation_threads_contact_idx"
  ON "conversation_threads"("contact_id")
  WHERE "contact_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "conversation_threads_status_idx"
  ON "conversation_threads"("status");
CREATE INDEX IF NOT EXISTS "conversation_threads_assigned_idx"
  ON "conversation_threads"("assigned_to_user_id")
  WHERE "assigned_to_user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "conversation_threads_last_message_idx"
  ON "conversation_threads"("last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "conversation_threads_unread_idx"
  ON "conversation_threads"("unread_count")
  WHERE "unread_count" > 0;

-- -----------------------------------------------------------------------------
-- 2) conversation_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "conversation_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "thread_id" UUID NOT NULL REFERENCES "conversation_threads"("id") ON DELETE CASCADE,

  "channel" TEXT NOT NULL CHECK ("channel" IN (
    'whatsapp', 'telegram', 'instagram', 'facebook_messenger',
    'email', 'sms', 'internal_note'
  )),
  -- Platform's message ID — idempotency key so webhook + polling races
  -- don't double-insert the same incoming message.
  "external_message_id" TEXT,
  "external_thread_id" TEXT,

  "direction" TEXT NOT NULL CHECK ("direction" IN ('inbound', 'outbound')),

  -- Sender — for inbound, the platform's sender ID. For outbound, the
  -- internal app_user who sent it.
  "sender_external_id" TEXT,
  "sender_display_name" TEXT,
  "sender_user_id" UUID REFERENCES "app_users"("id") ON DELETE SET NULL,

  -- Recipient — set on outbound; channel may need this even when
  -- thread.external_identifiers carries it.
  "recipient_external_id" TEXT,

  "content_type" TEXT NOT NULL DEFAULT 'text' CHECK ("content_type" IN (
    'text', 'image', 'document', 'audio', 'video',
    'location', 'contact', 'sticker', 'template_message',
    'reaction', 'reply', 'system'
  )),
  "content_text" TEXT,
  "content_media_url" TEXT,
  "content_media_thumbnail_url" TEXT,
  -- Channel-specific extras: {longitude, latitude} for location;
  -- {emoji, reacted_to} for reaction; etc.
  "content_metadata" JSONB,

  -- Threading: reply_to_external_id is the platform's reference, the
  -- FK to conversation_messages.id is set when we've ingested the parent.
  "reply_to_external_id" TEXT,
  "reply_to_message_id" UUID REFERENCES "conversation_messages"("id") ON DELETE SET NULL,

  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN (
    'pending', 'sent', 'delivered', 'read', 'failed', 'received'
  )),
  "error_message" TEXT,

  "sent_at" TIMESTAMPTZ,
  "delivered_at" TIMESTAMPTZ,
  "read_at" TIMESTAMPTZ,
  "received_at" TIMESTAMPTZ,

  -- Cost tracking — per-channel pricing model. Telegram is free
  -- (cost_minor=0); WhatsApp Business charges per conversation
  -- (24h window). Resend / Gmail / others vary.
  "cost_minor" BIGINT,
  "cost_currency" TEXT,

  "raw_payload" JSONB,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: the same external message can't be ingested twice.
  -- NULL external_message_id is allowed (e.g. internal notes), and
  -- multiple NULLs don't violate UNIQUE in Postgres by default.
  CONSTRAINT "conversation_messages_channel_external_unique"
    UNIQUE ("channel", "external_message_id")
);

CREATE INDEX IF NOT EXISTS "conversation_messages_thread_idx"
  ON "conversation_messages"("thread_id");
CREATE INDEX IF NOT EXISTS "conversation_messages_direction_idx"
  ON "conversation_messages"("direction");
CREATE INDEX IF NOT EXISTS "conversation_messages_status_idx"
  ON "conversation_messages"("status");
CREATE INDEX IF NOT EXISTS "conversation_messages_external_thread_idx"
  ON "conversation_messages"("external_thread_id")
  WHERE "external_thread_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "conversation_messages_received_idx"
  ON "conversation_messages"("received_at" DESC)
  WHERE "received_at" IS NOT NULL;
-- Partial index for the cron status-sync scanner: only outbound
-- messages still waiting for delivered/read receipts need the rescan.
CREATE INDEX IF NOT EXISTS "conversation_messages_pending_status_idx"
  ON "conversation_messages"("channel", "status", "sent_at")
  WHERE "direction" = 'outbound'
    AND "status" IN ('sent', 'delivered');

-- -----------------------------------------------------------------------------
-- 3) message_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "message_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Operator-facing code (e.g. 'booking_confirmation', 'arrival_instructions').
  -- Used by auto_response_rules + the composer's template picker.
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,

  "supported_channels" TEXT[] NOT NULL,

  -- Per-channel content: { "whatsapp": "Hi {{guest_name}}...",
  -- "email": "<html>..." }. Variable substitution happens at send time.
  "content_per_channel" JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- For WhatsApp Business — Meta requires pre-approved templates for
  -- messages outside the 24h conversation window. The template_name
  -- must match the name registered with Meta; status tracks approval.
  "whatsapp_template_name" TEXT,
  "whatsapp_template_status" TEXT CHECK (
    "whatsapp_template_status" IS NULL OR
    "whatsapp_template_status" IN ('pending', 'approved', 'rejected')
  ),

  -- Variables expected — used to validate substitution and surface
  -- the variable picker in the UI.
  "variables" TEXT[] NOT NULL DEFAULT '{}',

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'active', 'archived'
  )),

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One template code per org.
  CONSTRAINT "message_templates_org_code_unique"
    UNIQUE ("organization_id", "code")
);

CREATE INDEX IF NOT EXISTS "message_templates_org_idx"
  ON "message_templates"("organization_id");
CREATE INDEX IF NOT EXISTS "message_templates_status_idx"
  ON "message_templates"("status");
CREATE INDEX IF NOT EXISTS "message_templates_active_idx"
  ON "message_templates"("organization_id", "status")
  WHERE "status" = 'active';

-- -----------------------------------------------------------------------------
-- 4) auto_response_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auto_response_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  "name" TEXT NOT NULL,
  "description" TEXT,

  -- Trigger config: which channels + what kind of trigger + per-trigger config.
  "channels" TEXT[] NOT NULL,
  "trigger_type" TEXT NOT NULL CHECK ("trigger_type" IN (
    'keyword', 'first_message', 'after_hours', 'no_response_timeout'
  )),
  -- Per trigger_type:
  --   keyword: { "keywords": ["price", "rate"], "match_type": "any" | "all" }
  --   first_message: {}
  --   after_hours: { "timezone": "Asia/Jakarta", "start_hour": 18, "end_hour": 9 }
  --   no_response_timeout: { "minutes": 60 }
  "trigger_config" JSONB NOT NULL,

  -- Action config: send template, send text, assign, or tag.
  "action_type" TEXT NOT NULL CHECK ("action_type" IN (
    'send_template', 'send_text', 'assign_to_user', 'add_tag'
  )),
  -- Per action_type:
  --   send_template: { "template_id": "uuid", "variables": {...} }
  --   send_text: { "text": "..." }
  --   assign_to_user: { "user_id": "uuid" }
  --   add_tag: { "tag": "..." }
  "action_config" JSONB NOT NULL,

  -- Don't trigger same rule on same thread within this window.
  "throttle_window_minutes" INTEGER NOT NULL DEFAULT 60,

  -- Lower number = higher priority (evaluated first).
  "priority" INTEGER NOT NULL DEFAULT 100,

  "is_active" BOOLEAN NOT NULL DEFAULT true,

  "trigger_count" INTEGER NOT NULL DEFAULT 0,
  "last_triggered_at" TIMESTAMPTZ,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auto_response_rules_org_idx"
  ON "auto_response_rules"("organization_id");
CREATE INDEX IF NOT EXISTS "auto_response_rules_active_idx"
  ON "auto_response_rules"("is_active", "priority")
  WHERE "is_active" = TRUE;

-- -----------------------------------------------------------------------------
-- 5) updated_at triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "messaging_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_threads_updated_at" ON "conversation_threads";
CREATE TRIGGER "trg_threads_updated_at"
  BEFORE UPDATE ON "conversation_threads"
  FOR EACH ROW EXECUTE FUNCTION "messaging_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_messages_updated_at" ON "conversation_messages";
CREATE TRIGGER "trg_messages_updated_at"
  BEFORE UPDATE ON "conversation_messages"
  FOR EACH ROW EXECUTE FUNCTION "messaging_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_templates_updated_at" ON "message_templates";
CREATE TRIGGER "trg_templates_updated_at"
  BEFORE UPDATE ON "message_templates"
  FOR EACH ROW EXECUTE FUNCTION "messaging_set_updated_at"();

DROP TRIGGER IF EXISTS "trg_rules_updated_at" ON "auto_response_rules";
CREATE TRIGGER "trg_rules_updated_at"
  BEFORE UPDATE ON "auto_response_rules"
  FOR EACH ROW EXECUTE FUNCTION "messaging_set_updated_at"();

-- -----------------------------------------------------------------------------
-- 6) RLS — per-org isolation via is_in_user_organization() (Stage 5.J helper).
--
-- Uses FOREACH t IN ARRAY ARRAY[...] per the migration 0075 lesson —
-- Postgres versions vary on FOR ... IN SELECT unnest(...) syntax.
-- Tests assert this pattern explicitly so future contributors can't regress.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conversation_threads',
    'conversation_messages',
    'message_templates',
    'auto_response_rules'
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
