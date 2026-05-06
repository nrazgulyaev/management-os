-- =============================================================================
-- 0067 — Development OS · Stage 5.H.1 — Working Calendars + Holidays
--
-- 2 new tables:
--   - working_calendars   per-project / vendor / company-wide calendars
--   - holiday_calendar    holidays + non-working days per calendar
--
-- Pre-seeds COMPANY_DEFAULT (5-day) + BALI_STANDARD (6-day) + 2026 holidays.
-- All RLS-protected, internal-only.
-- Idempotent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) working_calendars
-- =============================================================================

CREATE TABLE IF NOT EXISTS "working_calendars" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "calendar_code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,

  "scope" TEXT NOT NULL CHECK ("scope" IN ('company_wide', 'project', 'vendor')),
  "project_id" UUID REFERENCES "projects"("id"),
  "vendor_id" UUID REFERENCES "vendors"("id"),

  "working_days_of_week" INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}',

  "working_hours_per_day" NUMERIC(5,2) NOT NULL DEFAULT 8,
  "daily_start_time" TIME DEFAULT '08:00',
  "daily_end_time" TIME DEFAULT '17:00',
  "break_duration_hours" NUMERIC(4,2) DEFAULT 1,

  "country_code" TEXT NOT NULL DEFAULT 'ID',
  "region_code" TEXT,

  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,

  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    (scope = 'project' AND project_id IS NOT NULL AND vendor_id IS NULL) OR
    (scope = 'vendor' AND vendor_id IS NOT NULL AND project_id IS NULL) OR
    (scope = 'company_wide' AND project_id IS NULL AND vendor_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS "working_calendars_project_idx" ON "working_calendars"("project_id");
CREATE INDEX IF NOT EXISTS "working_calendars_vendor_idx" ON "working_calendars"("vendor_id");
CREATE INDEX IF NOT EXISTS "working_calendars_active_idx" ON "working_calendars"("is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "working_calendars_default_unique"
  ON "working_calendars"("country_code")
  WHERE "is_default" = TRUE AND "scope" = 'company_wide';

CREATE OR REPLACE FUNCTION "working_calendars_set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN NEW."updated_at" := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_working_calendars_updated_at" ON "working_calendars";
CREATE TRIGGER "trg_working_calendars_updated_at"
  BEFORE UPDATE ON "working_calendars"
  FOR EACH ROW EXECUTE FUNCTION "working_calendars_set_updated_at"();


-- =============================================================================
-- 2) holiday_calendar
-- =============================================================================

CREATE TABLE IF NOT EXISTS "holiday_calendar" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  "calendar_id" UUID NOT NULL REFERENCES "working_calendars"("id") ON DELETE CASCADE,

  "holiday_date" DATE NOT NULL,

  "holiday_name" TEXT NOT NULL,
  "holiday_type" TEXT NOT NULL CHECK ("holiday_type" IN (
    'national_holiday', 'regional_holiday', 'religious_observance',
    'company_holiday', 'project_specific', 'site_unavailable',
    'weather_closure', 'other_non_working'
  )),

  "is_full_day" BOOLEAN NOT NULL DEFAULT TRUE,
  "partial_hours_lost" NUMERIC(5,2),

  "is_recurring" BOOLEAN NOT NULL DEFAULT FALSE,
  "recurrence_pattern" TEXT,

  "notes" TEXT,
  "source" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE ("calendar_id", "holiday_date")
);

CREATE INDEX IF NOT EXISTS "holiday_calendar_calendar_idx"
  ON "holiday_calendar"("calendar_id");
CREATE INDEX IF NOT EXISTS "holiday_calendar_date_idx"
  ON "holiday_calendar"("holiday_date");
CREATE INDEX IF NOT EXISTS "holiday_calendar_recurring_idx"
  ON "holiday_calendar"("is_recurring");


-- =============================================================================
-- 3) Seed default calendars (idempotent)
-- =============================================================================

INSERT INTO "working_calendars" (calendar_code, name, scope, working_days_of_week, country_code, is_default)
VALUES ('COMPANY_DEFAULT', 'Company Default (Mon-Fri)', 'company_wide', '{1,2,3,4,5}', 'ID', TRUE)
ON CONFLICT (calendar_code) DO NOTHING;

INSERT INTO "working_calendars" (calendar_code, name, scope, working_days_of_week, country_code, region_code)
VALUES ('BALI_STANDARD', 'Bali Construction Standard (Mon-Sat)', 'company_wide', '{1,2,3,4,5,6}', 'ID', 'BALI')
ON CONFLICT (calendar_code) DO NOTHING;


-- =============================================================================
-- 4) Seed 2026 Indonesian + Bali holidays (idempotent)
-- =============================================================================

DO $$
DECLARE
  default_cal UUID;
  bali_cal UUID;
BEGIN
  SELECT id INTO default_cal FROM working_calendars WHERE calendar_code = 'COMPANY_DEFAULT';
  SELECT id INTO bali_cal FROM working_calendars WHERE calendar_code = 'BALI_STANDARD';

  -- 2026 Indonesian National Holidays (apply to both calendars)
  INSERT INTO holiday_calendar (calendar_id, holiday_date, holiday_name, holiday_type, is_recurring, recurrence_pattern, source)
  VALUES
    (default_cal, '2026-01-01', 'New Year', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (default_cal, '2026-02-17', 'Chinese New Year', 'national_holiday', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-03-03', 'Isra Miraj', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-03-29', 'Good Friday', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-04-13', 'Idul Fitri Day 1', 'national_holiday', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-04-14', 'Idul Fitri Day 2', 'national_holiday', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-05-01', 'Labour Day', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (default_cal, '2026-05-14', 'Ascension of Jesus Christ', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-05-31', 'Vesak Day', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-06-01', 'Pancasila Day', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (default_cal, '2026-06-20', 'Idul Adha', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-07-10', 'Islamic New Year', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-08-17', 'Independence Day', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (default_cal, '2026-09-19', 'Maulid Nabi', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (default_cal, '2026-12-25', 'Christmas', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    -- Same nationals for BALI_STANDARD
    (bali_cal, '2026-01-01', 'New Year', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (bali_cal, '2026-02-17', 'Chinese New Year', 'national_holiday', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-03-03', 'Isra Miraj', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-03-29', 'Good Friday', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-04-13', 'Idul Fitri Day 1', 'national_holiday', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-04-14', 'Idul Fitri Day 2', 'national_holiday', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-05-01', 'Labour Day', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (bali_cal, '2026-05-14', 'Ascension of Jesus Christ', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-05-31', 'Vesak Day', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-06-01', 'Pancasila Day', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (bali_cal, '2026-06-20', 'Idul Adha', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-07-10', 'Islamic New Year', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-08-17', 'Independence Day', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    (bali_cal, '2026-09-19', 'Maulid Nabi', 'religious_observance', TRUE, 'lunar_calendar', 'official_government'),
    (bali_cal, '2026-12-25', 'Christmas', 'national_holiday', TRUE, 'annual_fixed', 'official_government'),
    -- Bali-specific Hindu / Wuku calendar (sample 2026)
    (bali_cal, '2026-02-04', 'Galungan', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-02-14', 'Kuningan', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-03-19', 'Nyepi (Day of Silence)', 'regional_holiday', TRUE, 'lunar_calendar', 'banjar_decision'),
    (bali_cal, '2026-04-04', 'Saraswati Day', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-04-08', 'Pagerwesi', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-09-02', 'Galungan', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-09-12', 'Kuningan', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-11-04', 'Saraswati Day', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision'),
    (bali_cal, '2026-11-08', 'Pagerwesi', 'regional_holiday', TRUE, 'wuku_calendar', 'banjar_decision')
  ON CONFLICT (calendar_id, holiday_date) DO NOTHING;
END $$;


-- =============================================================================
-- 5) RLS — internal-only
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['working_calendars', 'holiday_calendar'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
