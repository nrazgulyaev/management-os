-- 0134 · TENANCY KEYSTONE (TENANT-2) — give `projects` a real organization_id.
--
-- `projects` was the root tenancy gap: the entire Development tree (villas,
-- ownership_shares, contacts, land_profiles, and bookings-via-villa) reaches
-- its organization THROUGH a project, but `projects` itself carried no
-- organization_id. App-layer tenancy (requireOrgId + explicit WHERE org) had
-- nothing to anchor on here, so project reads/writes were effectively global.
--
-- This anchors it: add the column, backfill every existing project to the
-- single ARCONIQUE_DEFAULT seed org (the platform is single-tenant today),
-- FK + index it, and enforce NOT NULL once all rows are anchored. Idempotent.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- Anchor existing rows to the default org (organization_code is UNIQUE, so
-- there is exactly one match).
UPDATE projects
   SET organization_id = (
     SELECT id FROM organizations
      WHERE organization_code = 'ARCONIQUE_DEFAULT'
      LIMIT 1
   )
 WHERE organization_id IS NULL;

-- Enforce NOT NULL only when every row is anchored (robust if an env has no
-- ARCONIQUE_DEFAULT org — there the column stays nullable rather than failing
-- the migration).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE organization_id IS NULL) THEN
    ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS projects_organization_idx ON projects(organization_id);
