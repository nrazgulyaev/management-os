-- =============================================================================
-- 0170 · STAFF / PAYROLL (recurring staff cost → finance expense pipeline)
--
-- WHY: verification found there is NO payroll. Recurring staff salaries
-- (housekeeper, pool technician, gardener, security) could only be modelled
-- as ad-hoc one-off expense lines (/dashboard/finance/expenses/new, type
-- staff_allocation). The operator could not record "who costs what" (a rate)
-- and have it automatically flow into project/villa costs + owner statements
-- every month.
--
-- WHAT (additive only — two new tables, no change to any existing table or
-- to the money math):
--
--   staff
--     A roster of paid staff with a monthly rate and a default allocation
--     scope/target. NOT a payroll line itself — just the rate card.
--       * monthly_rate_minor BIGINT — minor units of `currency` (the binding
--         money rule: USD 1,200.00 → 120000; IDR uses 2-decimal scale).
--       * allocation_scope text — 'villa' | 'project_pool' | 'company',
--         mirrors expense_lines.allocation_scope so the generated expense
--         lands in exactly the right bucket.
--       * villa_id / project_id — optional target for the scope.
--       * organization_id NOT NULL — tenant scope (#199/#200 write-flow).
--
--   payroll_runs
--     One row per (org, period_month). Records that payroll was posted for a
--     month + the aggregate total + how many expense lines it generated. The
--     UNIQUE(organization_id, period_month) is the idempotency guard — the
--     "Run payroll for <month>" action is a no-op if a run already exists, so
--     it can never double-post salaries into finance.
--
-- The generated cost is a NORMAL expense_lines row (type 'staff_allocation',
-- the staff member's scope/target, owner_chargeable=true). It flows into owner
-- statements through the EXISTING statement generator (which already sums
-- posted, owner-chargeable expense_lines by villa_id / project_pool). No
-- parallel money path is created. expense_lines is org-scoped today via its
-- villa/project relationship exactly like every other manual expense.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD CONSTRAINT guards. Safe re-run.
-- Additive only — no destructive change. Latest applied before this = 0169.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS staff (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  full_name          text NOT NULL,
  role_label         text NOT NULL,            -- 'Housekeeper' | 'Pool technician' | 'Gardener' | ...
  monthly_rate_minor bigint NOT NULL,          -- minor units of `currency`
  currency           text NOT NULL DEFAULT 'IDR',
  allocation_scope   text NOT NULL DEFAULT 'company',  -- villa | project_pool | company
  villa_id           uuid REFERENCES villas (id) ON DELETE SET NULL,
  project_id         uuid REFERENCES projects (id) ON DELETE SET NULL,
  active             boolean NOT NULL DEFAULT true,
  notes              text,
  created_by         uuid REFERENCES app_users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_org_idx ON staff (organization_id);
CREATE INDEX IF NOT EXISTS staff_org_active_idx ON staff (organization_id, active);
CREATE INDEX IF NOT EXISTS staff_villa_idx ON staff (villa_id);
CREATE INDEX IF NOT EXISTS staff_project_idx ON staff (project_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  period_month    date NOT NULL,              -- first day of the payroll month (YYYY-MM-01)
  label           text NOT NULL,              -- human label e.g. 'June 2026'
  currency        text NOT NULL DEFAULT 'IDR',
  total_minor     bigint NOT NULL DEFAULT 0,  -- aggregate posted across all expense lines
  staff_count     integer NOT NULL DEFAULT 0, -- active staff posted in this run
  expense_count   integer NOT NULL DEFAULT 0, -- expense_lines created
  status          text NOT NULL DEFAULT 'posted',  -- posted | voided
  posted_by       uuid REFERENCES app_users (id) ON DELETE SET NULL,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotency guard: one payroll run per org per month. The "Run payroll"
-- action checks for this row first and refuses to double-post.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_org_period_unique
  ON payroll_runs (organization_id, period_month);

CREATE INDEX IF NOT EXISTS payroll_runs_org_idx ON payroll_runs (organization_id);

-- Link generated expense lines back to the run that created them (for the
-- history view + so a future void can find them). Nullable, additive on the
-- existing expense_lines table.
ALTER TABLE expense_lines
  ADD COLUMN IF NOT EXISTS payroll_run_id uuid REFERENCES payroll_runs (id) ON DELETE SET NULL;

ALTER TABLE expense_lines
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expense_lines_payroll_run_idx ON expense_lines (payroll_run_id);

COMMIT;
