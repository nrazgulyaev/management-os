-- =============================================================================
-- 0064 — Development OS · Stage 5.E.2 — Content workflow
--
-- 2 new tables:
--   - content_pieces    marketing content with 9-state pipeline
--   - content_variants  per-language / per-platform variants
--
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) content_pieces
-- =============================================================================

CREATE TABLE IF NOT EXISTS "content_pieces" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "content_code" TEXT UNIQUE NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,

  "content_type" TEXT NOT NULL CHECK ("content_type" IN (
    'instagram_post', 'instagram_reel', 'instagram_story',
    'tiktok_video', 'tiktok_carousel',
    'youtube_video', 'youtube_short',
    'blog_article', 'press_release',
    'email_newsletter', 'email_campaign',
    'whatsapp_broadcast', 'video_ad',
    'photo_ad', 'static_post', 'carousel_post', 'other'
  )),

  "related_project_ids" UUID[] NOT NULL DEFAULT '{}',
  "related_campaign_id" UUID REFERENCES "campaigns"("id"),

  "content_brief" TEXT NOT NULL,
  "target_audience" TEXT,
  "key_messages" TEXT[] NOT NULL DEFAULT '{}',

  "primary_language" TEXT NOT NULL DEFAULT 'en',
  "available_languages" TEXT[] NOT NULL DEFAULT '{}',

  "primary_asset_id" UUID REFERENCES "documents"("id"),
  "supporting_asset_ids" UUID[] NOT NULL DEFAULT '{}',

  "caption" TEXT,
  "hashtags" TEXT[] NOT NULL DEFAULT '{}',
  "call_to_action" TEXT,
  "link_url" TEXT,

  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN (
    'draft', 'in_production', 'pending_review', 'approved',
    'scheduled', 'published', 'paused', 'archived', 'rejected'
  )),
  "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "reviewed_by" UUID REFERENCES "app_users"("id"),
  "reviewed_at" TIMESTAMPTZ,
  "approved_by" UUID REFERENCES "app_users"("id"),
  "approved_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,

  "scheduled_publish_at" TIMESTAMPTZ,
  "published_at" TIMESTAMPTZ,
  "external_post_url" TEXT,
  "external_post_id" TEXT,

  "ai_assisted_creation" BOOLEAN NOT NULL DEFAULT FALSE,
  "ai_marketing_assistant_output_id" UUID REFERENCES "agent_outputs"("id"),

  "performance_metrics" JSONB,
  "performance_last_updated" TIMESTAMPTZ,

  "notes" TEXT,
  "internal_notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "content_pieces_status_idx" ON "content_pieces"("status");
CREATE INDEX IF NOT EXISTS "content_pieces_type_idx" ON "content_pieces"("content_type");
CREATE INDEX IF NOT EXISTS "content_pieces_campaign_idx" ON "content_pieces"("related_campaign_id");
CREATE INDEX IF NOT EXISTS "content_pieces_scheduled_idx"
  ON "content_pieces"("scheduled_publish_at") WHERE "status" = 'scheduled';
CREATE INDEX IF NOT EXISTS "content_pieces_published_idx"
  ON "content_pieces"("published_at" DESC) WHERE "status" = 'published';

CREATE OR REPLACE FUNCTION "content_pieces_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_content_pieces_updated_at" ON "content_pieces";
CREATE TRIGGER "trg_content_pieces_updated_at"
  BEFORE UPDATE ON "content_pieces"
  FOR EACH ROW EXECUTE FUNCTION "content_pieces_set_updated_at"();


-- =============================================================================
-- 2) content_variants
-- =============================================================================

CREATE TABLE IF NOT EXISTS "content_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_content_id" UUID NOT NULL REFERENCES "content_pieces"("id") ON DELETE CASCADE,

  "variant_type" TEXT NOT NULL CHECK ("variant_type" IN (
    'language', 'platform', 'audience', 'format', 'a_b_test'
  )),
  "variant_label" TEXT NOT NULL,

  "language_code" TEXT,
  "platform_target" TEXT,

  "caption" TEXT,
  "hashtags" TEXT[] NOT NULL DEFAULT '{}',
  "call_to_action" TEXT,
  "link_url" TEXT,

  "primary_asset_id" UUID REFERENCES "documents"("id"),

  "variant_status" TEXT NOT NULL DEFAULT 'draft' CHECK ("variant_status" IN (
    'draft', 'pending_review', 'approved', 'published'
  )),

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "content_variants_parent_idx" ON "content_variants"("parent_content_id");
CREATE INDEX IF NOT EXISTS "content_variants_status_idx" ON "content_variants"("variant_status");

CREATE OR REPLACE FUNCTION "content_variants_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_content_variants_updated_at" ON "content_variants";
CREATE TRIGGER "trg_content_variants_updated_at"
  BEFORE UPDATE ON "content_variants"
  FOR EACH ROW EXECUTE FUNCTION "content_variants_set_updated_at"();


-- =============================================================================
-- 3) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['content_pieces', 'content_variants'])
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
