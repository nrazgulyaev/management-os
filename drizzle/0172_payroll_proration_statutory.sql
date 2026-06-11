-- =============================================================================
-- 0172 · PAYROLL PRORATION + EFFECTIVE-DATING + INDONESIAN STATUTORY (BPJS/PPh21)
--
-- WHY: docs/STAFF-COST-MODEL.md left two items out of scope that this migration
-- closes, ADDITIVELY, without changing any existing payroll behaviour:
--   1. PRORATION + effective-dating — a staff member hired/ended mid-month
--      should only cost the days they were active, not a full month. Salaried +
--      per_villa_fixed amounts get prorated by active-days / days-in-month. A
--      staff member not active at all in the month posts nothing.
--   2. INDONESIAN STATUTORY (BPJS Ketenagakerjaan + Kesehatan + PPh21 via the
--      post-2024 TER monthly method). When enabled on a SALARIED staff member,
--      the cost the owner/management actually bears becomes gross + EMPLOYER
--      BPJS (the true employment cost), while employee BPJS + PPh21 are withheld
--      from gross and remitted to the state (NOT extra employer cost). The
--      breakdown is recorded per-run in payroll_payslips for the payslip view.
--
-- DESIGN NOTE (binding): statutory is OFF by default. Existing payroll behaviour
-- is byte-for-byte unchanged unless an org enables it AND flips it on per staff.
-- All rates/caps are EDITABLE org defaults (org_payroll_settings), seeded with
-- the researched 2026 figures (BPJS letter B/1226/022026; PMK 168/2023; PMK
-- 101/2016 PTKP). The December Article-17 annual reconciliation is OUT OF SCOPE.
--
-- Money rule (binding): every *_minor / *_cap_minor is BIGINT minor units. Rates
-- are stored as numeric percentages (e.g. 3.7 = 3.7%). Org scope (#199/#200):
-- org_payroll_settings + payroll_payslips both carry organization_id NOT NULL;
-- every read/write ANDs it.
--
-- Idempotent: ADD COLUMN/CONSTRAINT IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- Safe to re-run. Latest applied before this = 0171.
-- =============================================================================

BEGIN;

-- --- 1. staff: effective-dating + per-staff statutory opt-in -----------------
-- hired_on / ended_on bound the active window for proration (both NULL = always
-- active, the legacy behaviour). rate_effective_from is an optional informational
-- marker for when the current rate took effect (not used in the proration math —
-- proration uses the employment window, not the rate-change date).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hired_on date;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ended_on date;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS rate_effective_from date;

-- statutory_enabled gates BPJS/PPh21 entirely. ptkp_status drives the PPh21 TER
-- category (TK/0..K/3). no_npwp adds the +20% PPh21 surcharge per the rules.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS statutory_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ptkp_status text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS no_npwp boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_ptkp_status_check') THEN
    ALTER TABLE staff
      ADD CONSTRAINT staff_ptkp_status_check
      CHECK (ptkp_status IS NULL OR ptkp_status IN (
        'TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3'
      ));
  END IF;
END $$;

-- --- 2. org_payroll_settings: editable BPJS / PPh21 defaults per org ---------
-- One row per org. Seeded lazily from app code (the researched 2026 defaults) on
-- first read/enable; the table only stores OVERRIDES + the enabled flag. Rates
-- are numeric percentages; caps are bigint minor units of the org currency (IDR).
CREATE TABLE IF NOT EXISTS org_payroll_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE RESTRICT,
  -- Master switch: even if a staff member has statutory_enabled, nothing is
  -- computed unless the org has turned statutory on.
  statutory_enabled        boolean NOT NULL DEFAULT false,

  -- BPJS Ketenagakerjaan — JHT (old-age): no cap, full gross.
  jht_employer_pct         numeric(6, 4) NOT NULL DEFAULT 3.7000,
  jht_employee_pct         numeric(6, 4) NOT NULL DEFAULT 2.0000,
  -- JKK (work-accident): employer-only, risk-tier selectable (0.24..1.74).
  jkk_employer_pct         numeric(6, 4) NOT NULL DEFAULT 0.2400,
  -- JKM (death): employer-only.
  jkm_employer_pct         numeric(6, 4) NOT NULL DEFAULT 0.3000,
  -- JP (pension): capped wage base (Rp11,086,300 eff. March 2026).
  jp_employer_pct          numeric(6, 4) NOT NULL DEFAULT 2.0000,
  jp_employee_pct          numeric(6, 4) NOT NULL DEFAULT 1.0000,
  jp_cap_minor             bigint NOT NULL DEFAULT 1108630000,  -- Rp11,086,300 * 100
  -- BPJS Kesehatan (health): capped wage base (Rp12,000,000).
  kesehatan_employer_pct   numeric(6, 4) NOT NULL DEFAULT 4.0000,
  kesehatan_employee_pct   numeric(6, 4) NOT NULL DEFAULT 1.0000,
  kesehatan_cap_minor      bigint NOT NULL DEFAULT 1200000000,  -- Rp12,000,000 * 100

  -- PPh21 (income tax, TER monthly method). Toggle + no-NPWP surcharge default.
  pph21_enabled            boolean NOT NULL DEFAULT true,
  no_npwp_surcharge_pct    numeric(6, 4) NOT NULL DEFAULT 20.0000,

  currency                 text NOT NULL DEFAULT 'IDR',
  updated_by               uuid REFERENCES app_users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_payroll_settings_org_idx ON org_payroll_settings (organization_id);

-- --- 3. payroll_payslips: per-run, per-staff statutory breakdown -------------
-- ONE row per (run, staff) when statutory is computed — the payslip view source.
-- The single expense_line still carries the TOTAL employer cost (gross +
-- employer BPJS); this table only records the split for transparency. Employee
-- deductions + PPh21 are withheld from gross, NOT extra expense lines.
CREATE TABLE IF NOT EXISTS payroll_payslips (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  payroll_run_id           uuid NOT NULL REFERENCES payroll_runs (id) ON DELETE CASCADE,
  staff_id                 uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  currency                 text NOT NULL DEFAULT 'IDR',

  -- Prorated gross actually used for this run (after effective-date proration).
  gross_minor              bigint NOT NULL DEFAULT 0,
  proration_numerator      integer NOT NULL DEFAULT 0,   -- active days in month
  proration_denominator    integer NOT NULL DEFAULT 0,   -- days in month

  -- Employer-side BPJS, by component (adds to true employment cost).
  employer_jht_minor       bigint NOT NULL DEFAULT 0,
  employer_jkk_minor       bigint NOT NULL DEFAULT 0,
  employer_jkm_minor       bigint NOT NULL DEFAULT 0,
  employer_jp_minor        bigint NOT NULL DEFAULT 0,
  employer_kesehatan_minor bigint NOT NULL DEFAULT 0,
  employer_contrib_minor   bigint NOT NULL DEFAULT 0,     -- sum of the five above

  -- Employee-side withholdings (deducted from gross, remitted — NOT employer cost).
  employee_jht_minor       bigint NOT NULL DEFAULT 0,
  employee_jp_minor        bigint NOT NULL DEFAULT 0,
  employee_kesehatan_minor bigint NOT NULL DEFAULT 0,
  employee_bpjs_minor      bigint NOT NULL DEFAULT 0,      -- sum of the three above
  pph21_minor              bigint NOT NULL DEFAULT 0,
  ter_category             text,                           -- A | B | C | null

  -- Derived totals.
  net_take_home_minor      bigint NOT NULL DEFAULT 0,      -- gross - employee BPJS - pph21
  total_employer_cost_minor bigint NOT NULL DEFAULT 0,     -- gross + employer_contrib

  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_payslips_org_idx ON payroll_payslips (organization_id);
CREATE INDEX IF NOT EXISTS payroll_payslips_run_idx ON payroll_payslips (payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_payslips_staff_idx ON payroll_payslips (staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_payslips_run_staff_unique
  ON payroll_payslips (payroll_run_id, staff_id);

COMMIT;
