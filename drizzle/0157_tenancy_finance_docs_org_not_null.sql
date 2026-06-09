-- 0157 · TENANCY-FINANCE-DOCS — NOT NULL cutover for the org-anchored
-- FINANCE / DOCS / INFRA tables whose inserts are now FULLY covered.
--
-- Pairs with migration 0151 (nullable add + backfill). 0157 promotes the
-- `organization_id` column to NOT NULL only for the tables where EVERY insert
-- site in the app layer now sets it (Drizzle schema flipped to .notNull() in
-- lockstep). The matching app threading lives on branch w/thread-finance-docs:
--   revenue_streams        -> createRevenueStream (requireOrgId)
--   unit_cost_allocations  -> writeUnitAllocation (copies parent project org)
--   cashflow_forecasts     -> generateCashflowForecast (requireOrgId)
--                             + cashflow auto-generate cron (ARCONIQUE_DEFAULT)
--
-- Every cutover is GUARDED so the migration never fails:
--   * skips if the column was never applied (0151 not yet run), and
--   * skips if ANY row is still NULL (a stale env that hasn't backfilled),
-- in which case the column simply stays nullable rather than aborting.
-- Idempotent: SET NOT NULL on an already-NOT-NULL column is a harmless no-op.
--
-- The remaining domain tables (documents / documents-app / notifications /
-- statement_* / jobs / payments / direct_booking_deposit*) keep their NULLABLE
-- anchor for now — their inserts are still too scattered (crons / system /
-- portal paths with no session) to guarantee a non-null org at every site.

-- revenue_streams ----------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'revenue_streams'
                AND column_name = 'organization_id')
     AND NOT EXISTS (SELECT 1 FROM revenue_streams WHERE organization_id IS NULL)
  THEN
    ALTER TABLE revenue_streams ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- unit_cost_allocations ----------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'unit_cost_allocations'
                AND column_name = 'organization_id')
     AND NOT EXISTS (SELECT 1 FROM unit_cost_allocations WHERE organization_id IS NULL)
  THEN
    ALTER TABLE unit_cost_allocations ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- cashflow_forecasts -------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'cashflow_forecasts'
                AND column_name = 'organization_id')
     AND NOT EXISTS (SELECT 1 FROM cashflow_forecasts WHERE organization_id IS NULL)
  THEN
    ALTER TABLE cashflow_forecasts ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;
