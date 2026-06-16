-- =============================================================================
-- 0182 · STATEMENT-SETTINGS — per-org configuration for what an owner statement
--        includes and how tax/reserve are computed. One row per organization.
--
-- The canonical LEDGER generator (src/features/finance/statement-generator.ts)
-- reads this row (via getStatementSettings(), org-scoped) and honors it:
--   - include_fees / include_expenses / include_management_fee toggle whole
--     sections of the statement on/off.
--   - tax_mode / reserve_mode ∈ {off, ledger, formula}:
--       off     → no tax/reserve lines at all
--       ledger  → read posted tax_lines / reserve_movements (today's behavior)
--       formula → DO NOT read the ledger; compute % of gross revenue
--   - tax_pct / reserve_pct are the formula percentages (0–100).
--   - *_label / mgmt_label drive the statement-line descriptions.
--   - statement_currency replaces the old hardcoded "USD" default.
--
-- DEFAULT SAFETY: the column defaults below exactly reproduce TODAY's behavior
-- (all includes true, tax_mode='ledger', reserve_mode='ledger'). An org with NO
-- row gets the same DEFAULTS object in code, so generation is unchanged until an
-- operator opts in.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + guarded index. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS org_statement_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  include_fees boolean NOT NULL DEFAULT true,
  include_expenses boolean NOT NULL DEFAULT true,
  include_management_fee boolean NOT NULL DEFAULT true,
  -- allowed: 'off' | 'ledger' | 'formula'
  tax_mode text NOT NULL DEFAULT 'ledger',
  tax_pct numeric(6,3) NOT NULL DEFAULT 11.000,
  tax_label text NOT NULL DEFAULT 'Tax',
  -- allowed: 'off' | 'ledger' | 'formula'
  reserve_mode text NOT NULL DEFAULT 'ledger',
  reserve_pct numeric(6,3) NOT NULL DEFAULT 3.000,
  reserve_label text NOT NULL DEFAULT 'Reserve',
  mgmt_label text NOT NULL DEFAULT 'Management fee',
  statement_currency text NOT NULL DEFAULT 'IDR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- One settings row per org (the upsert in updateStatementSettingsAction keys on
-- this). Use a unique INDEX (idempotent) rather than a table constraint so the
-- migration stays safely re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS org_statement_settings_org_unique
  ON org_statement_settings(organization_id);

COMMIT;
