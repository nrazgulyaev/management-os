-- =============================================================================
-- 0181 · PERF — composite indexes (wave 2) on the hottest aggregate paths.
--
-- 0177 covered the dashboard KPI tables (bookings org+status+check_in,
-- owner_statements org+status/month, inbox tables). This wave targets the
-- query shapes that 0177 did NOT reach and that profiling of the cabinet
-- aggregates + the owner-statement GENERATOR surfaced:
--
--   * the statement generator (the heaviest single write path) reads
--     ownership_shares + revenue/fee/expense lines + bookings with a
--     (status, scope, date) shape that the existing single-leg / scope-only
--     indexes can't satisfy from one index;
--   * getOwnersYtdPayouts / getFinanceKpis filter ownership_shares on
--     (organization_id, status='active') — only single-column org and status
--     indexes exist, so the planner ANDs two bitmaps;
--   * getAgentActivity runs on EVERY Overview load against the high-volume
--     agent_invocation_log filtering (organization_id, invoked_at >= now-24h)
--     — there is no org+time composite today;
--   * the operations cabinet filters maintenance_tickets by (villa_id, status)
--     and orders the list / digest by reported_at, neither of which is indexed;
--   * owner_stay_requests pending-count + calendar reads filter (org, status).
--
-- All composites lead with the equality column(s) the query pins, then the
-- range/sort column last, so each query is satisfiable from one index scan.
--
-- Mirrors the Drizzle schema index definitions added alongside this migration
-- (same names/columns), so the schema and DB stay in agreement.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS. Safe to re-run. Additive only — no
-- table rewrites, no behaviour change.
--
-- NOTE: plain (non-CONCURRENT) CREATE INDEX briefly locks each table against
-- writes for the duration of the build. On the first real tenant this is
-- effectively instant (little data). On a large shared dataset, run during low
-- traffic, or convert these to CREATE INDEX CONCURRENTLY (which must run
-- OUTSIDE a transaction — drop the BEGIN/COMMIT and apply one statement at a
-- time) if the lock window is a concern.
-- =============================================================================

BEGIN;

-- ownership_shares — owner payout / finance KPI aggregates pin
-- (organization_id, status='active'); the generator pins
-- (owner_id, status='active') then range-scans the period window on starts_on.
CREATE INDEX IF NOT EXISTS ownership_shares_org_status_idx
  ON ownership_shares (organization_id, status);
CREATE INDEX IF NOT EXISTS ownership_shares_owner_status_starts_idx
  ON ownership_shares (owner_id, status, starts_on);

-- bookings — statement-generator occupancy + per-villa portfolio subqueries
-- filter villa_id + status IN (...) + a check_in range. The existing
-- bookings_villa_idx (villa_id, check_in) lacks the status leg.
CREATE INDEX IF NOT EXISTS bookings_villa_status_checkin_idx
  ON bookings (villa_id, status, check_in);

-- agent_invocation_log — Overview "AI agents · live" card hits this
-- high-volume log on every load with (organization_id, invoked_at >= now-24h).
CREATE INDEX IF NOT EXISTS agent_invocation_log_org_invoked_idx
  ON agent_invocation_log (organization_id, invoked_at);

-- maintenance_tickets — ops KPI + ticket list filter (villa_id, status);
-- the list/digest also order/filter by reported_at. No org column on this
-- table (scoped via villa -> project), so these are scope+sort composites.
CREATE INDEX IF NOT EXISTS maintenance_tickets_villa_status_idx
  ON maintenance_tickets (villa_id, status);
CREATE INDEX IF NOT EXISTS maintenance_tickets_reported_at_idx
  ON maintenance_tickets (reported_at);

-- owner_stay_requests — Overview pending-count + bookings calendar filter
-- (organization_id, status). Only single-column org / status indexes exist.
CREATE INDEX IF NOT EXISTS owner_stay_requests_org_status_idx
  ON owner_stay_requests (organization_id, status);

-- revenue / fee / expense lines — the statement generator pulls posted rows by
-- scope (villa_id) within a [period_start, period_end] window. The existing
-- (villa_id, <date>) indexes don't carry status; lead with status='posted'
-- (the constant every pull pins) so the index is fully usable.
CREATE INDEX IF NOT EXISTS revenue_lines_status_villa_date_idx
  ON revenue_lines (status, villa_id, service_date);
CREATE INDEX IF NOT EXISTS fee_lines_status_villa_date_idx
  ON fee_lines (status, villa_id, fee_date);
CREATE INDEX IF NOT EXISTS expense_lines_status_villa_date_idx
  ON expense_lines (status, villa_id, expense_date);

-- owner_statements — generator idempotency lookup pins
-- (owner_id, period_id, organization_id); the existing (owner_id, period_id)
-- lacks org. The live list orders (organization_id, period_month DESC,
-- created_at DESC) — the existing (org, period_month) lacks the created_at
-- tiebreak so the sort still spills.
CREATE INDEX IF NOT EXISTS owner_statements_org_owner_period_idx
  ON owner_statements (organization_id, owner_id, period_id);
CREATE INDEX IF NOT EXISTS owner_statements_org_period_month_created_idx
  ON owner_statements (organization_id, period_month, created_at);

COMMIT;
