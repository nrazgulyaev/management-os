-- 0149 · TENANCY (tenancy-ops) — additive organization_id foundation for the
-- operational tree.
--
-- The Development tenancy keystone landed in 0134 (projects.organization_id,
-- NOT NULL) and `villas` reaches its org THROUGH project_id. Everything in the
-- operational layer below — bookings, the per-booking detail tables, the
-- availability/readiness primitives, check-in flow, operations + maintenance
-- intelligence, the owner-booking projections, and the operational security
-- registries — still carries NO direct organization_id, so app-layer tenancy
-- (requireOrgId + explicit WHERE org) has nothing to anchor on at those rows.
--
-- This migration is the ADDITIVE FOUNDATION only:
--   * ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id)
--     — NULLABLE (no NOT NULL): existing inserts keep compiling, threading is a
--     deliberate follow-on.
--   * BACKFILL through each table's REAL parent chain to projects.organization_id
--     (villas carry org via project_id; bookings via villa; detail/event tables
--     via booking; utility readings/reminders via utility_account; owner revenue
--     breakdowns via their summary). Where no parent chain exists, fall back to
--     the single ARCONIQUE_DEFAULT seed org (the platform is single-tenant today).
--   * CREATE INDEX on each new column.
--
-- Fully idempotent. We deliberately DO NOT set NOT NULL and DO NOT thread org
-- into any query here — that is the next unit's work.

-- Resolve the default org once into a temp helper expression via a CTE-free
-- subquery used throughout. organization_code is UNIQUE so there is at most one.

-- =========================================================================
-- 1. bookings — chain: bookings.villa_id -> villas.project_id -> projects.org
-- =========================================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

UPDATE bookings b
   SET organization_id = p.organization_id
  FROM villas v
  JOIN projects p ON p.id = v.project_id
 WHERE b.villa_id = v.id
   AND b.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS bookings_organization_idx ON bookings(organization_id);

-- =========================================================================
-- 2. booking_detail tables — chain: *.booking_id -> bookings.organization_id
-- =========================================================================
ALTER TABLE booking_guests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE booking_guests x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_guests_organization_idx ON booking_guests(organization_id);

ALTER TABLE booking_charges
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE booking_charges x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_charges_organization_idx ON booking_charges(organization_id);

ALTER TABLE booking_payments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE booking_payments x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_payments_organization_idx ON booking_payments(organization_id);

ALTER TABLE booking_meta
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE booking_meta x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_meta_organization_idx ON booking_meta(organization_id);

-- =========================================================================
-- 3. availability primitives
--    villa_calendar_blocks / villa_readiness_states -> villa -> project
--    booking_stay_events / checkin_checkout_requests -> booking
-- =========================================================================
ALTER TABLE villa_calendar_blocks
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE villa_calendar_blocks x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS villa_calendar_blocks_organization_idx ON villa_calendar_blocks(organization_id);

ALTER TABLE villa_readiness_states
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE villa_readiness_states x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS villa_readiness_states_organization_idx ON villa_readiness_states(organization_id);

ALTER TABLE booking_stay_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE booking_stay_events x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_stay_events_organization_idx ON booking_stay_events(organization_id);

ALTER TABLE checkin_checkout_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE checkin_checkout_requests x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS checkin_checkout_requests_organization_idx ON checkin_checkout_requests(organization_id);

-- =========================================================================
-- 4. booking_checkin_flow — pk booking_id -> bookings.organization_id
-- =========================================================================
ALTER TABLE booking_checkin_flow
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE booking_checkin_flow x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_checkin_flow_organization_idx ON booking_checkin_flow(organization_id);

-- =========================================================================
-- 5. operation_tasks — villa -> project (else default org)
-- =========================================================================
ALTER TABLE operation_tasks
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE operation_tasks x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
-- direct project_id (no villa) wins next
UPDATE operation_tasks x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
-- remaining (no villa, no project) -> default org
UPDATE operation_tasks
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS operation_tasks_organization_idx ON operation_tasks(organization_id);

-- =========================================================================
-- 6. maintenance-intelligence tables
-- =========================================================================
ALTER TABLE villa_maintenance_plans
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE villa_maintenance_plans x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS villa_maintenance_plans_organization_idx ON villa_maintenance_plans(organization_id);

ALTER TABLE maintenance_window_suggestions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE maintenance_window_suggestions x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS maintenance_window_suggestions_organization_idx ON maintenance_window_suggestions(organization_id);

ALTER TABLE utility_accounts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE utility_accounts x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
UPDATE utility_accounts x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
UPDATE utility_accounts
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS utility_accounts_organization_idx ON utility_accounts(organization_id);

ALTER TABLE utility_readings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE utility_readings x
   SET organization_id = ua.organization_id
  FROM utility_accounts ua
 WHERE x.utility_account_id = ua.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS utility_readings_organization_idx ON utility_readings(organization_id);

ALTER TABLE utility_payment_reminders
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE utility_payment_reminders x
   SET organization_id = ua.organization_id
  FROM utility_accounts ua
 WHERE x.utility_account_id = ua.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS utility_payment_reminders_organization_idx ON utility_payment_reminders(organization_id);

ALTER TABLE maintenance_risk_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE maintenance_risk_events x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
UPDATE maintenance_risk_events x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
UPDATE maintenance_risk_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS maintenance_risk_events_organization_idx ON maintenance_risk_events(organization_id);

-- =========================================================================
-- 7. owner_booking projections — villa -> project (else default);
--    revenue breakdowns inherit from their summary.
-- =========================================================================
ALTER TABLE owner_booking_summaries
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE owner_booking_summaries x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
UPDATE owner_booking_summaries x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
UPDATE owner_booking_summaries x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
UPDATE owner_booking_summaries
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS owner_booking_summaries_organization_idx ON owner_booking_summaries(organization_id);

ALTER TABLE owner_booking_revenue_breakdowns
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE owner_booking_revenue_breakdowns x
   SET organization_id = s.organization_id
  FROM owner_booking_summaries s
 WHERE x.owner_booking_summary_id = s.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS owner_booking_revenue_breakdowns_organization_idx ON owner_booking_revenue_breakdowns(organization_id);

ALTER TABLE owner_revenue_source_monthly
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE owner_revenue_source_monthly x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
UPDATE owner_revenue_source_monthly x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
UPDATE owner_revenue_source_monthly
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS owner_revenue_source_monthly_organization_idx ON owner_revenue_source_monthly(organization_id);

-- =========================================================================
-- 8. operational security registries
--    security_camera_devices    -> villa/project -> project.org (else default)
--    user_responsibility_scopes -> project (else villa->project,
--                                   else user->app_users.org)
--    guest_stay_security_events -> booking -> bookings.org
-- =========================================================================
ALTER TABLE security_camera_devices
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE security_camera_devices x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
UPDATE security_camera_devices x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
UPDATE security_camera_devices
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS security_camera_devices_organization_idx ON security_camera_devices(organization_id);

ALTER TABLE user_responsibility_scopes
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE user_responsibility_scopes x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL;
UPDATE user_responsibility_scopes x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL;
UPDATE user_responsibility_scopes x
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE x.user_id = au.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS user_responsibility_scopes_organization_idx ON user_responsibility_scopes(organization_id);

ALTER TABLE guest_stay_security_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE guest_stay_security_events x
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE x.booking_id = b.id AND x.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS guest_stay_security_events_organization_idx ON guest_stay_security_events(organization_id);
