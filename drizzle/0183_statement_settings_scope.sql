-- =============================================================================
-- 0183 · STATEMENT-SETTINGS SCOPING — extend org_statement_settings from
--        one-row-per-org to PER-SCOPE rows (org-default / per-project /
--        per-owner), and add a custom-deductions table.
--
-- SCOPE MODEL: a settings row is keyed by (organization_id, project_id,
-- owner_id). The most-specific row wins at read time (owner > project > org).
--   - project_id NULL AND owner_id NULL → the ORG-DEFAULT row (what every
--     existing 0182 row becomes — it keeps driving generation unchanged).
--   - project_id set, owner_id NULL     → applies to all owners in a project.
--   - owner_id set                      → applies to one owner.
-- Exactly one row may exist per scope tuple; COALESCE-on-NULL in the unique
-- index gives NULLs a sentinel so (org, NULL, NULL) is unique like any other.
--
-- NEW GENERATOR KNOBS (column defaults reproduce TODAY's behavior):
--   - mgmt_mode ∈ {off, ledger, formula} DEFAULT 'ledger' — how the management
--     fee is computed. 'formula' uses mgmt_pct (% of gross). 'ledger' reads the
--     posted management-fee lines as today; 'off' suppresses the fee.
--   - mgmt_pct numeric DEFAULT 20.000 — the formula percentage.
--   - revenue_source ∈ {ledger, bookings} DEFAULT 'ledger' — where gross
--     revenue comes from ('ledger' = posted revenue_lines, today's behavior).
--
-- NEW TABLE org_statement_custom_deductions — operator-defined extra deduction
-- lines (e.g. "Linen fee", "Pool service"), each scoped the same (org/project/
-- owner) way. formula = % of gross; fixed = a flat minor-unit amount.
--
-- Idempotent: guarded ADD COLUMN / DROP INDEX / CREATE INDEX / CREATE TABLE.
-- Safe to re-run. No data is destroyed (existing rows become org-defaults).
-- =============================================================================

BEGIN;

-- 1 · PER-SCOPE columns on the existing settings table -----------------------
ALTER TABLE org_statement_settings
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE org_statement_settings
  ADD COLUMN IF NOT EXISTS owner_id uuid
    REFERENCES owners(id) ON DELETE CASCADE;

-- New generator knobs. Defaults reproduce today's generation exactly.
ALTER TABLE org_statement_settings
  ADD COLUMN IF NOT EXISTS mgmt_mode text NOT NULL DEFAULT 'ledger';

ALTER TABLE org_statement_settings
  ADD COLUMN IF NOT EXISTS mgmt_pct numeric(6,3) NOT NULL DEFAULT 20.000;

ALTER TABLE org_statement_settings
  ADD COLUMN IF NOT EXISTS revenue_source text NOT NULL DEFAULT 'ledger';

-- Swap the one-row-per-org unique index (from 0182) for a per-scope one.
-- Existing rows (project_id + owner_id both NULL) collapse to the org-default
-- tuple and remain unique under the new index.
DROP INDEX IF EXISTS org_statement_settings_org_unique;

CREATE UNIQUE INDEX IF NOT EXISTS org_statement_settings_scope_unique
  ON org_statement_settings (
    organization_id,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 2 · Custom deduction lines (scoped the same org/project/owner way) ----------
CREATE TABLE IF NOT EXISTS org_statement_custom_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid,
  owner_id uuid,
  label text NOT NULL,
  -- allowed: 'formula' | 'fixed'
  mode text NOT NULL DEFAULT 'formula',
  -- when mode='formula': % of gross revenue (0–100)
  pct numeric(6,3),
  -- when mode='fixed': flat amount in minor units
  fixed_amount_minor bigint,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_statement_custom_deductions_org_idx
  ON org_statement_custom_deductions (organization_id);

COMMIT;
