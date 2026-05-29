-- 0116 — Unify maintenance severity vocabulary to p0–p3.
--
-- maintenance_tickets.severity and damage_reports.severity were
-- low/normal/high/urgent (0005). The maintenance SLA model
-- (src/features/maintenance/sla.ts) and the design speak P0–P3. This
-- migration makes the DB the single source of truth in lowercase
-- p0–p3, so there is no dual vocabulary / mapping layer.
--
-- Forward migration for already-applied databases: scripts/migrate.ts
-- tracks files by name and never re-runs 0005, so the CREATE-TABLE text
-- in 0005 is NOT the deploy vehicle — this file is.
--
-- Mapping: urgent→p0, high→p1, normal→p2, low→p3 (default normal→p2).
-- Order per column: DROP old CHECK → backfill existing rows → SET
-- DEFAULT → ADD new CHECK. Dropping the constraint first means the
-- backfill UPDATE never transiently violates a constraint; the new
-- CHECK is added last, after all rows already hold p0–p3.
-- Generic `priority` columns (operation_tasks, service_requests,
-- notifications, jobs, channels, guest-journey, maintenance_templates
-- default_priority, …) are intentionally left as low/normal/high/urgent.

-- maintenance_tickets.severity ------------------------------------------------
ALTER TABLE maintenance_tickets
  DROP CONSTRAINT IF EXISTS maintenance_tickets_severity_check;

UPDATE maintenance_tickets SET severity = CASE severity
  WHEN 'urgent' THEN 'p0'
  WHEN 'high'   THEN 'p1'
  WHEN 'normal' THEN 'p2'
  WHEN 'low'    THEN 'p3'
  ELSE 'p2'
END;

ALTER TABLE maintenance_tickets ALTER COLUMN severity SET DEFAULT 'p2';

ALTER TABLE maintenance_tickets
  ADD CONSTRAINT maintenance_tickets_severity_check
  CHECK (severity IN ('p0','p1','p2','p3'));

-- damage_reports.severity -----------------------------------------------------
ALTER TABLE damage_reports
  DROP CONSTRAINT IF EXISTS damage_reports_severity_check;

UPDATE damage_reports SET severity = CASE severity
  WHEN 'urgent' THEN 'p0'
  WHEN 'high'   THEN 'p1'
  WHEN 'normal' THEN 'p2'
  WHEN 'low'    THEN 'p3'
  ELSE 'p2'
END;

ALTER TABLE damage_reports ALTER COLUMN severity SET DEFAULT 'p2';

ALTER TABLE damage_reports
  ADD CONSTRAINT damage_reports_severity_check
  CHECK (severity IN ('p0','p1','p2','p3'));
