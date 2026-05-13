-- =============================================================================
-- 0097 — Sprint 4 · import_templates (column-mapping memory for bulk imports)
--
-- The Sprint-4 transaction import wizard reads CSV/XLSX/paste-from-Sheets
-- input and asks the operator to map source columns to destination
-- transaction fields (date / direction / amount / currency / category
-- name / project code / vendor / description / notes). Operators run
-- the same import multiple times per month — saving the mapping
-- makes the second-and-onward run a single click.
--
-- Per-org catalog (org_id NOT NULL, RLS enabled with the standard
-- org_isolation policy). Soft-deletes via is_active. Templates are
-- versioned via `(name, version)` so an operator can iterate without
-- losing history; queries default to the highest version per name.
--
-- column_mapping shape (JSONB):
--   {
--     "source_columns": ["Date","Type","USD","Category","Note","Vendor"],
--     "destination_mapping": {
--       "Date":     "date",
--       "Type":     "direction",
--       "USD":      "amountMajor",
--       "Category": "categoryName",
--       "Note":     "description",
--       "Vendor":   "counterpartyName"
--     },
--     "constants": {
--       "currency": "USD"          // applied to every row when absent from source
--     },
--     "transform": {
--       "direction_map": { "Expense": "outflow", "Income": "inflow" }
--     }
--   }
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "import_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source_kind" TEXT NOT NULL CHECK ("source_kind" IN (
    'csv', 'xlsx', 'sheets_paste', 'sheets_live'
  )),
  "destination_kind" TEXT NOT NULL DEFAULT 'transactions' CHECK ("destination_kind" IN (
    'transactions'
  )),
  "column_mapping" JSONB NOT NULL,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID,
  "last_used_at" TIMESTAMPTZ,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organization_id", "name", "version")
);

CREATE INDEX IF NOT EXISTS "import_templates_org_idx"
  ON "import_templates"("organization_id");
CREATE INDEX IF NOT EXISTS "import_templates_active_idx"
  ON "import_templates"("is_active") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "import_templates_org_name_version_idx"
  ON "import_templates"("organization_id", "name", "version" DESC);

-- -----------------------------------------------------------------------------
-- RLS — per-org isolation, internal-bypass via the standard helper.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_templates'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS org_isolation ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t
    );
  END LOOP;
END $$;

-- updated_at trigger reuses the existing helper (subscription_set_updated_at
-- from 0085; it's plan-agnostic — just NEW.updated_at = now()).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_templates'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; '
      'CREATE TRIGGER %I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION subscription_set_updated_at();',
      t || '_set_updated_at', t,
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

COMMIT;
