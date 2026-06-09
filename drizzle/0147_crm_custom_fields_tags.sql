-- Migration 0147 — crm_custom_fields_tags
--
-- CRM-CUSTOM-FIELDS-TAGS (Attio parity). Generic tagging + custom-field
-- overlay for ANY CRM subject (owner | contact | lead | guest | villa | …),
-- keyed off a plain `subject_type` text discriminator so the machinery never
-- has to know about the modules it annotates.
--
--   crm_tags                — org tag vocabulary (label + colour token).
--   crm_tag_assignments     — join (subject_type, subject_id) → tag.
--   crm_custom_field_defs   — org-scoped field schema per entity.
--   crm_custom_field_values — (subject + def) → typed jsonb value.
--
-- All four tables are NEW + org-scoped: organization_id is NOT NULL with an
-- FK → organizations (these tables start empty, so NOT NULL is correct — the
-- "add nullable then backfill" rule only applies to columns added to EXISTING
-- populated tables). No money columns (CRM metadata only). Fully idempotent.

CREATE TABLE IF NOT EXISTS crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  -- lower-cased slug for case-insensitive uniqueness within the org
  slug text NOT NULL,
  -- Layer-B token name: accent | gold | success | danger | info | warning | neutral
  color text NOT NULL DEFAULT 'neutral',
  description text,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_tags_org_slug_unique
  ON crm_tags (organization_id, slug);

CREATE INDEX IF NOT EXISTS crm_tags_org_active_idx
  ON crm_tags (organization_id)
  WHERE is_archived = false;

CREATE TABLE IF NOT EXISTS crm_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  -- generic discriminator (no FK — cross-module)
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- a tag is on a subject at most once
CREATE UNIQUE INDEX IF NOT EXISTS crm_tag_assignments_unique
  ON crm_tag_assignments (tag_id, subject_type, subject_id);

-- "what tags are on this subject?" (detail-page read)
CREATE INDEX IF NOT EXISTS crm_tag_assignments_subject_idx
  ON crm_tag_assignments (organization_id, subject_type, subject_id);

-- "which subjects carry this tag?" (list filter)
CREATE INDEX IF NOT EXISTS crm_tag_assignments_tag_idx
  ON crm_tag_assignments (organization_id, tag_id);

CREATE TABLE IF NOT EXISTS crm_custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- which entity this field applies to (owner | contact | …)
  entity text NOT NULL,
  -- stable machine key (snake_case), unique per (org, entity)
  key text NOT NULL,
  label text NOT NULL,
  -- text | number | date | select
  field_type text NOT NULL,
  -- for 'select': JSON array of allowed option strings
  options jsonb,
  help_text text,
  display_order integer NOT NULL DEFAULT 100,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_custom_field_defs_key_unique
  ON crm_custom_field_defs (organization_id, entity, key);

CREATE INDEX IF NOT EXISTS crm_custom_field_defs_entity_idx
  ON crm_custom_field_defs (organization_id, entity, display_order)
  WHERE is_archived = false;

CREATE TABLE IF NOT EXISTS crm_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  def_id uuid NOT NULL REFERENCES crm_custom_field_defs(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  -- uniform value bag, coerced per the def's field_type by readers
  value jsonb,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- one value per (def, subject)
CREATE UNIQUE INDEX IF NOT EXISTS crm_custom_field_values_unique
  ON crm_custom_field_values (def_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS crm_custom_field_values_subject_idx
  ON crm_custom_field_values (organization_id, subject_type, subject_id);
