-- =============================================================================
-- 0162 · TENANCY (Sales / installments slice) — give the two org-less contract
--        tables an organization_id, NULLABLE, backfilled + indexed.
--
-- WHY: `contract_groups` and `contract_milestones` carry buyer money
-- (installment schedules) but had NO organization_id. Tenancy was only
-- transitive via contract_groups.project_id -> projects.organization_id, so
-- the operator installments desk (markMilestonePaidByOperator etc.) could load
-- and mutate a milestone by raw id with no org scope — a latent cross-tenant
-- money IDOR. This migration adds the column so the action layer can AND the
-- caller org into the WHERE clause. (Single-tenant today: every row backfills
-- to the one ARCONIQUE_DEFAULT org via the real contract->project->org chain,
-- so adding the column + scoping does NOT change current behavior.)
--
-- SCOPE (this migration only): SCHEMA + BACKFILL + INDEX. It does NOT thread
-- organization_id into INSERTs and does NOT set the column NOT NULL. The column
-- lands NULLABLE so the app layer can adopt it incrementally (mirrors the
-- NULLABLE tenancy style of migration 0150).
--
-- BACKFILL PARENTAGE (verified per table's real FK):
--   * contract_groups.project_id     -> projects.organization_id
--   * contract_milestones.contract_group_id -> contract_groups.organization_id
--       (after contract_groups is backfilled)
--   * any row still NULL after the above -> ARCONIQUE_DEFAULT seed org.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + backfill only NULLs + CREATE INDEX IF
-- NOT EXISTS. No NOT NULL is set anywhere. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add the NULLABLE column (+ FK to organizations) to each target table.
-- ---------------------------------------------------------------------------
ALTER TABLE contract_groups
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE contract_milestones
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. Backfill via each table's real parent FK (only rows still NULL).
--    Order matters: contract_groups (project parent) before contract_milestones
--    (which derives its org from contract_groups).
-- ---------------------------------------------------------------------------

-- 2a. contract_groups.project_id -> projects.organization_id
UPDATE contract_groups cg
   SET organization_id = p.organization_id
  FROM projects p
 WHERE cg.project_id = p.id
   AND cg.organization_id IS NULL;

-- 2b. contract_milestones.contract_group_id -> contract_groups.organization_id
UPDATE contract_milestones cm
   SET organization_id = cg.organization_id
  FROM contract_groups cg
 WHERE cm.contract_group_id = cg.id
   AND cm.organization_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Final fallback — any row still NULL (orphaned parent, missing org on the
--    parent, etc.) goes to the single ARCONIQUE_DEFAULT seed org. No-op when
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
    UPDATE contract_groups     SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE contract_milestones SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Per-org index on each table (idempotent).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS contract_groups_organization_idx     ON contract_groups(organization_id);
CREATE INDEX IF NOT EXISTS contract_milestones_organization_idx ON contract_milestones(organization_id);

COMMIT;
