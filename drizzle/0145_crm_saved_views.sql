-- Migration 0145 — crm_saved_views
--
-- CRM-SAVED-VIEWS-BULK (#169). Attio's killer feature: a saved "view" is a
-- named snapshot of (a) the advanced multi-condition filter applied to a CRM
-- list and (b) the visible column set. Views are org + user scoped — a user's
-- private views are theirs alone, but an org-shared view (is_shared = true) is
-- visible to everyone in the same organization. Powers the <FilterBar> /
-- saved-view switcher on the owners list first, then contacts + leads.
--
-- entity: which CRM list this view targets — 'owners' | 'contacts' | 'leads'.
-- filter_json: serialized advanced filter (array of {field, op, values}).
-- columns_json: ordered array of visible column keys (null → list default).
--
-- TENANCY (#169 policy): organization_id is NULLABLE here. We DO scope reads
-- by org in the query layer for real sessions, but the column is added without
-- a NOT NULL constraint and without backfilling existing rows to a tenant, so
-- the demo / unauthenticated path keeps working. Indexed for the (org, user,
-- entity) lookup the switcher runs on every list render.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS crm_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenant scope. NULLABLE per tenancy policy (no backfill, no DB NOT NULL).
  organization_id uuid,
  -- Owning user (app_users.id). NULL → a legacy / system-seeded view.
  app_user_id uuid,
  -- Which CRM list: owners | contacts | leads.
  entity text NOT NULL DEFAULT 'owners',
  name text NOT NULL,
  -- Serialized advanced filter: [{ field, op, values: string[] }].
  filter_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Ordered visible column keys, or NULL for the list default.
  columns_json jsonb,
  -- Org-shared (visible to the whole org) vs private to app_user_id.
  is_shared boolean NOT NULL DEFAULT false,
  -- The user's default view for this entity (at most one per user+entity,
  -- enforced in the action, not the DB).
  is_default boolean NOT NULL DEFAULT false,
  created_by_app_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_saved_views_org_entity_idx
  ON crm_saved_views (organization_id, entity);

CREATE INDEX IF NOT EXISTS crm_saved_views_user_entity_idx
  ON crm_saved_views (app_user_id, entity);

CREATE INDEX IF NOT EXISTS crm_saved_views_entity_shared_idx
  ON crm_saved_views (entity, is_shared);
