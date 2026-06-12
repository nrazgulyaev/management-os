-- =============================================================================
-- 0173 · TENANCY (owners) — give `owners` a real organization_id so owner reads
--        can be scoped per tenant. Until now `owners` had NO org column at all,
--        so listOwners()/getOwnerById()/listOwnershipShares() returned EVERY
--        org's owners globally (the Drizzle role is BYPASSRLS → no RLS net).
--        A new tenant therefore saw other orgs' — and leftover DEMO — owners.
--
-- RESOLUTION: an owner's org = the org of any of their ownership_shares.
-- `ownership_shares.organization_id` was already backfilled in 0154
-- (villa → project.organization_id, else the share's project_id), so we read it
-- straight off the shares. Owners with no share-resolvable org fall back to the
-- single ARCONIQUE_DEFAULT seed org (the platform is single-tenant today).
--
-- SCOPE: SCHEMA + BACKFILL + INDEX, threaded into the app layer in the same PR
-- (services.ts reads + actions.ts writes). The column lands NULLABLE — mirrors
-- the conservative tenancy style of 0150/0151/0152/0154. The app scopes reads
-- with `owners.organization_id = <org>` (equality naturally excludes any NULL),
-- and createOwnerAction stamps the org on every new owner, so no NULL owners
-- are produced going forward. On a provisioned DB the default-org sweep below
-- leaves zero NULLs anyway.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE … WHERE organization_id IS NULL
-- + CREATE INDEX IF NOT EXISTS. No NOT NULL. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- 1) Resolve from the owner's shares. An owner with multiple shares is
--    realistically single-org; UPDATE … FROM picks one matching share (matches
--    the 0154 resolution style). Only shares whose org was resolved count.
UPDATE owners t
   SET organization_id = os.organization_id
  FROM ownership_shares os
 WHERE os.owner_id = t.id
   AND os.organization_id IS NOT NULL
   AND t.organization_id IS NULL;

-- 2) Any owner still NULL (no shares, or only NULL-org shares) → the single
--    ARCONIQUE_DEFAULT seed org. Skipped on a bare env that lacks it, in which
--    case the column simply stays NULL (never fail the migration).
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;
  IF default_org_id IS NOT NULL THEN
    UPDATE owners SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS owners_organization_idx ON owners(organization_id);

COMMIT;
