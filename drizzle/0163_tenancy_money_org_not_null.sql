-- 0163 · TENANCY (notnull-money) — flip organization_id to NOT NULL on the
-- six MONEY tables whose every application INSERT path now stamps the org
-- anchor.
--
-- The column + backfill landed earlier (nullable):
--   * payout_batches / payout_lines              → 0160
--   * distributions / distribution_allocations   → 0161
--   * contract_groups / contract_milestones      → 0162
--
-- The notnull-money unit then confirmed/threaded organization_id through
-- every application INSERT for these tables:
--   * createPayoutBatchAction / createPayoutLineAction (finance/actions.ts)
--       already stamped requireOrgId() (0160 hardening).
--   * declareDistribution (development/server/distribution-actions.ts)
--       already stamped requireOrgId() onto the distribution and every
--       allocation (0161 hardening).
--   * convertReservationToContract (development/server/contract-actions.ts)
--       NOW stamps requireOrgId() onto the contract group and every milestone,
--       guarded by a reservation→project→org IDOR check (this unit).
-- With tsc green on the .notNull() schema flip, the cutover below promotes the
-- DB constraint to match.
--
-- GUARDED + IDEMPOTENT: each table flips ONLY when (a) the column exists and
-- (b) no NULL rows remain. On a bare env where the column is absent, or a row
-- is somehow still NULL (e.g. a seed/import path that did not set the column),
-- the guard is a silent no-op rather than a hard failure — so `migrate.ts
-- --force` stays safe to re-run. Single-tenant today, so this is
-- behaviour-neutral.

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_batches' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM payout_batches WHERE organization_id IS NULL) THEN ALTER TABLE payout_batches ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_lines' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM payout_lines WHERE organization_id IS NULL) THEN ALTER TABLE payout_lines ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='distributions' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM distributions WHERE organization_id IS NULL) THEN ALTER TABLE distributions ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='distribution_allocations' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM distribution_allocations WHERE organization_id IS NULL) THEN ALTER TABLE distribution_allocations ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_groups' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM contract_groups WHERE organization_id IS NULL) THEN ALTER TABLE contract_groups ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_milestones' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM contract_milestones WHERE organization_id IS NULL) THEN ALTER TABLE contract_milestones ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;
