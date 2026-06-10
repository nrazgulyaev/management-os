-- =============================================================================
-- 0161 · TENANCY (Investor-capital / distributions slice) — give the org-less
--        `distributions` + `distribution_allocations` tables an
--        organization_id, NULLABLE, backfilled + indexed.
--
-- WHY (WRITE-FLOW-AUDIT.md): declareDistribution / executeDistribution /
-- cancelDistribution / editDistribution had NO org scope and NO ownership
-- check, and executeDistribution moves real money (wallet_transactions) — yet
-- these tables carried no organization_id, so a foreign distribution id could
-- be acted on (IDOR). This migration lands the local org anchor so the server
-- actions can scope load + write by organizationId.
--
-- SCOPE (this migration only): SCHEMA + BACKFILL + INDEX. It does NOT set the
-- DB column to NOT NULL — the column lands NULLABLE so the app layer can adopt
-- it incrementally (mirrors the NULLABLE tenancy style of 0150 dev slice).
--
-- BACKFILL PARENTAGE:
--   * distributions:
--       project_id -> projects.organization_id (projects carries org from 0134)
--       — company-wide rows (project_id IS NULL) and any row still NULL after
--         that go to the single ARCONIQUE_DEFAULT seed org.
--   * distribution_allocations:
--       distribution_id -> distributions.organization_id (after the above).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + backfill only NULLs + CREATE INDEX IF
-- NOT EXISTS. No NOT NULL is set anywhere. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add the NULLABLE column (+ FK to organizations) to each target table.
-- ---------------------------------------------------------------------------
ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE distribution_allocations
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. Backfill via each table's real parent FK (only rows still NULL).
--    distributions first, then distribution_allocations (which derives its
--    org from the parent distribution).
-- ---------------------------------------------------------------------------

-- 2a. distributions.project_id -> projects.organization_id
UPDATE distributions d
   SET organization_id = p.organization_id
  FROM projects p
 WHERE d.project_id = p.id
   AND d.organization_id IS NULL;

-- 2b. distribution_allocations.distribution_id -> distributions.organization_id
UPDATE distribution_allocations a
   SET organization_id = d.organization_id
  FROM distributions d
 WHERE a.distribution_id = d.id
   AND a.organization_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Final fallback — company-wide distributions (project_id IS NULL) and any
--    row still NULL go to the single ARCONIQUE_DEFAULT seed org. No-op when
--    that org is absent in an env (column simply stays NULL there).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;

  IF default_org_id IS NOT NULL THEN
    UPDATE distributions           SET organization_id = default_org_id WHERE organization_id IS NULL;
    -- Re-derive allocations from their (now-backfilled) parent first, then fall
    -- back to the seed org for any orphans.
    UPDATE distribution_allocations a
       SET organization_id = d.organization_id
      FROM distributions d
     WHERE a.distribution_id = d.id
       AND a.organization_id IS NULL;
    UPDATE distribution_allocations SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Per-org index on each table (idempotent).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS distributions_organization_idx            ON distributions(organization_id);
CREATE INDEX IF NOT EXISTS distribution_allocations_organization_idx ON distribution_allocations(organization_id);

COMMIT;
