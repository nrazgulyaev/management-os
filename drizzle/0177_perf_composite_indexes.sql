-- =============================================================================
-- 0177 · PERF — composite indexes on hot dashboard tables.
--
-- The multi-tenant scoping work added `WHERE organization_id = ?` to most reads,
-- but the hot dashboard queries filter org TOGETHER WITH status and/or a date,
-- and order by a date. Single-column org indexes serve the org filter but force
-- a separate scan/sort for the status + date legs. These composites match the
-- exact (filter, sort) shapes the dashboard runs, so the planner can satisfy
-- each query from one index.
--
-- Mirrors the Drizzle schema index definitions (same names/columns), so the
-- schema and DB stay in agreement.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS. Safe to re-run.
--
-- NOTE: plain (non-CONCURRENT) CREATE INDEX briefly locks each table against
-- writes for the duration of the build. On the first real tenant this is
-- effectively instant (little data). On a large shared dataset, run during low
-- traffic, or convert these to CREATE INDEX CONCURRENTLY (which must run
-- OUTSIDE a transaction — drop the BEGIN/COMMIT and apply one statement at a
-- time) if the lock window is a concern.
-- =============================================================================

BEGIN;

-- bookings — dashboard KPI/aggregate queries: org + status + check-in range.
CREATE INDEX IF NOT EXISTS bookings_org_status_checkin_idx
  ON bookings (organization_id, status, check_in);
CREATE INDEX IF NOT EXISTS bookings_org_checkin_idx
  ON bookings (organization_id, check_in);

-- owner_statements — finance statements list/dashboard: org + status, org + month.
CREATE INDEX IF NOT EXISTS owner_statements_org_status_idx
  ON owner_statements (organization_id, status);
CREATE INDEX IF NOT EXISTS owner_statements_org_period_month_idx
  ON owner_statements (organization_id, period_month);

-- conversation_messages — high-volume table that had no org index at all.
CREATE INDEX IF NOT EXISTS conversation_messages_org_idx
  ON conversation_messages (organization_id);

-- direct_booking_requests — admin inbox: org + status, newest first.
CREATE INDEX IF NOT EXISTS direct_booking_requests_org_status_created_idx
  ON direct_booking_requests (organization_id, status, created_at DESC);

-- guest_services — catalog reads org + status='active' on every services page.
CREATE INDEX IF NOT EXISTS guest_services_org_status_idx
  ON guest_services (organization_id, status);

-- owner_threads — owner inbox + dispute queue: org + status, recent activity.
CREATE INDEX IF NOT EXISTS owner_threads_org_status_lastmsg_idx
  ON owner_threads (organization_id, status, last_message_at);

-- inventory_items — items list: org [+ status] ordered by name.
CREATE INDEX IF NOT EXISTS inv_items_org_status_name_idx
  ON inventory_items (organization_id, status, name);

-- inventory_movements — movement ledger: org, newest first (high-volume).
CREATE INDEX IF NOT EXISTS inv_movements_org_created_idx
  ON inventory_movements (organization_id, created_at);

COMMIT;
