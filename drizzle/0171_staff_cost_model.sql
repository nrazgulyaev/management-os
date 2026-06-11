-- =============================================================================
-- 0171 · STAFF COST MODEL (two-axis: compensation mode × cost bearer)
--
-- WHY: PR #220's payroll module (migration 0170) conflated two orthogonal
-- axes. Per docs/STAFF-COST-MODEL.md, a villa-operations staff cost has:
--   * a COMPENSATION MODE — how the monthly cost is computed
--       salaried        flat monthly amount (monthly_rate_minor)
--       per_villa_fixed rate × number of assigned villas (per_villa_rate_minor)
--       per_service     ad-hoc, NOT in the monthly run (skipped)
--   * a COST BEARER — who actually pays, INDEPENDENT of which villa/complex
--     the cost is attributed to:
--       owner       itemised on the owner's statement at cost (reduces payout)
--       management  absorbed by the company (company P&L, never reduces payout)
--       shared_pool apportioned across the complex's owners per villa
-- The same role can land on either bearer by dedication (a manager on one
-- villa = owner; a manager on 30 villas = management). The bearer is the
-- column phase 2 (statement + P&L integration) reads to route the money.
--
-- WHAT (additive only — three changes, no destructive change, no money-math
-- change to existing rows):
--
--   staff (extend):
--     * comp_mode           text NOT NULL DEFAULT 'salaried'
--                             CHECK (salaried | per_villa_fixed | per_service)
--     * cost_bearer         text NOT NULL DEFAULT 'owner'
--                             CHECK (owner | management | shared_pool)
--     * per_villa_rate_minor bigint NULL — used when comp_mode='per_villa_fixed'
--                             (monthly_rate_minor stays for salaried). minor
--                             units of `currency`, the binding money rule.
--     monthly_rate_minor / currency / active stay. allocation_scope/villa_id/
--     project_id become the FALLBACK single-target; multi-target lives in the
--     new staff_assignments join table.
--
--   staff_assignments (NEW): one staff → N villas/complexes.
--     per_villa_fixed cost = per_villa_rate_minor × sum(active weights); the
--     run fans out ONE expense line per active assignment, attributed to that
--     assignment's villa/project. organization_id NOT NULL — tenant scope
--     (#199/#200 write-flow): every read/write ANDs organization_id.
--
--   expense_lines (extend):
--     * cost_bearer text NOT NULL DEFAULT 'owner' — decoupled from
--       allocation_scope (which stays the GEOGRAPHIC target). This is the
--       contract column that lets a villa-attributed cost be management-borne.
--       Phase 2's statement generator + company-P&L report consume it:
--         owner_chargeable = (cost_bearer IN ('owner','shared_pool'))
--
-- Idempotent: ADD COLUMN/CONSTRAINT IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- Safe to re-run. Latest applied before this = 0170.
-- =============================================================================

BEGIN;

-- --- staff: the two axes + the per-villa rate -------------------------------
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS comp_mode text NOT NULL DEFAULT 'salaried';

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS cost_bearer text NOT NULL DEFAULT 'owner';

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS per_villa_rate_minor bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_comp_mode_check'
  ) THEN
    ALTER TABLE staff
      ADD CONSTRAINT staff_comp_mode_check
      CHECK (comp_mode IN ('salaried', 'per_villa_fixed', 'per_service'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_cost_bearer_check'
  ) THEN
    ALTER TABLE staff
      ADD CONSTRAINT staff_cost_bearer_check
      CHECK (cost_bearer IN ('owner', 'management', 'shared_pool'));
  END IF;
END $$;

-- --- staff_assignments: one staff → N villas/complexes -----------------------
CREATE TABLE IF NOT EXISTS staff_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  staff_id        uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  villa_id        uuid REFERENCES villas (id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects (id) ON DELETE CASCADE,
  weight          numeric(8, 3) NOT NULL DEFAULT 1,  -- per_villa fan-out multiplier
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_assignments_org_idx ON staff_assignments (organization_id);
CREATE INDEX IF NOT EXISTS staff_assignments_staff_idx ON staff_assignments (staff_id);
CREATE INDEX IF NOT EXISTS staff_assignments_staff_active_idx ON staff_assignments (staff_id, active);
CREATE INDEX IF NOT EXISTS staff_assignments_villa_idx ON staff_assignments (villa_id);
CREATE INDEX IF NOT EXISTS staff_assignments_project_idx ON staff_assignments (project_id);

-- --- expense_lines: the cost-bearer contract column (phase 2 reads this) ----
ALTER TABLE expense_lines
  ADD COLUMN IF NOT EXISTS cost_bearer text NOT NULL DEFAULT 'owner';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_cost_bearer_check'
  ) THEN
    ALTER TABLE expense_lines
      ADD CONSTRAINT expense_lines_cost_bearer_check
      CHECK (cost_bearer IN ('owner', 'management', 'shared_pool'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expense_lines_cost_bearer_idx ON expense_lines (cost_bearer);

COMMIT;
