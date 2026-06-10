-- =============================================================================
-- 0164 · INDONESIA TAX FILING LIFECYCLE (Налоги ID → mock parity)
--
-- WHY: tax_period_reports stops at 'submitted' with no proof of filing. The
-- mock (cc-functional-handoff/cabinets/dev-p1/Accounting.html, tab «Налоги ID»)
-- requires per-direction VAT declarations (e-Faktur PPN Keluaran = output VAT,
-- e-Faktur PPN Masukan = input VAT, e-Bupot PPh 23 = withholding), a
-- "File taxes" action stamping a DJP reference, and a period-close that is
-- BLOCKED until the period's declarations are filed.
--
-- WHAT (additive columns on tax_period_reports):
--   * djp_reference     text NULL  — DJP filing reference stamped by mark-filed.
--   * vat_direction     text NULL  — 'output' | 'input' | 'withholding' | NULL.
--                         NULL = legacy/direction-less aggregate (lease tax,
--                         corporate income tax, pre-0164 rows).
--   * filed_at          timestamptz NULL — when the declaration was filed.
--                         "Filed" is DERIVED (filed_at IS NOT NULL); the status
--                         CHECK from 0046 is untouched, so no enum rewrite.
--   * filed_by_user_id  uuid NULL → app_users — who filed it.
--
-- UNIQUE IDENTITY WIDENING (the one non-column change, required by the split):
--   0046 declared UNIQUE (tax_type_id, period_start, period_end), which makes
--   it IMPOSSIBLE to store both the output-VAT and input-VAT declarations of
--   one PPN tax type for the same period. We drop that constraint and replace
--   it with a unique expression index over the same three columns PLUS
--   COALESCE(vat_direction, 'all'). For every pre-existing row vat_direction
--   is NULL, so the old invariant (one direction-less report per type+period)
--   is fully preserved — the identity is widened, never weakened, and no
--   existing row can violate the new index.
--   NOTE: the app-layer upsert moves from ON CONFLICT to an explicit
--   select-then-insert/update (tax-actions.ts) so filed/submitted reports can
--   be skipped instead of silently overwritten by the monthly cron.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / DO-block constraint / IF EXISTS drops
-- / CREATE INDEX IF NOT EXISTS. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Additive columns.
-- ---------------------------------------------------------------------------
ALTER TABLE tax_period_reports
  ADD COLUMN IF NOT EXISTS djp_reference text;
ALTER TABLE tax_period_reports
  ADD COLUMN IF NOT EXISTS vat_direction text;
ALTER TABLE tax_period_reports
  ADD COLUMN IF NOT EXISTS filed_at timestamptz;
ALTER TABLE tax_period_reports
  ADD COLUMN IF NOT EXISTS filed_by_user_id uuid
  REFERENCES app_users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. CHECK on vat_direction (NULL allowed = direction-less aggregate).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE tax_period_reports
    ADD CONSTRAINT tax_period_reports_vat_direction_check
    CHECK (vat_direction IN ('output', 'input', 'withholding')
           OR vat_direction IS NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already applied
END $$;

-- ---------------------------------------------------------------------------
-- 3. Widen the report identity to include the VAT direction (see header).
--    COALESCE keeps NULL-direction rows unique per (type, period) exactly as
--    the 0046 constraint did.
-- ---------------------------------------------------------------------------
ALTER TABLE tax_period_reports
  DROP CONSTRAINT IF EXISTS tax_period_reports_unique;
CREATE UNIQUE INDEX IF NOT EXISTS tax_period_reports_type_period_direction_unique
  ON tax_period_reports (tax_type_id, period_start, period_end,
                         COALESCE(vat_direction, 'all'));

-- ---------------------------------------------------------------------------
-- 4. Lookup indexes for the period-close filing gate
--    (org + period overlap + filed_at IS NULL scans).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS tax_period_reports_filed_idx
  ON tax_period_reports (filed_at);
CREATE INDEX IF NOT EXISTS tax_period_reports_organization_idx
  ON tax_period_reports (organization_id);

COMMIT;
