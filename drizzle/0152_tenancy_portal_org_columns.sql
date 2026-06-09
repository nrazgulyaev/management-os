-- 0152 · TENANCY (tenancy-portal) — give the PORTAL/GUEST tables a nullable
-- `organization_id`.
--
-- These owner-portal, guest-portal and capital/contract tables reach their
-- organization only through a parent (owner → ownership_shares → project,
-- villa → project, booking → villa → project, project directly, or
-- contract_group → project). App-layer tenancy (requireOrgId + explicit
-- WHERE org) had nothing local to anchor on. This adds the column, backfills
-- it from the real parent chain (falling back to the single ARCONIQUE_DEFAULT
-- seed org — the platform is single-tenant today), and indexes it.
--
-- SCHEMA + BACKFILL ONLY. The column stays NULLABLE: queries are NOT threaded
-- and we do NOT set NOT NULL here (that lands with the app-layer scoping unit).
-- Idempotent — ADD COLUMN IF NOT EXISTS, UPDATE … WHERE organization_id IS
-- NULL, CREATE INDEX IF NOT EXISTS — so `migrate.ts --force` is a no-op.

-- The default-org id, resolved once. organization_code is UNIQUE.
-- We inline the lookup per-statement rather than rely on a session var so the
-- file is a single self-contained DDL/DML batch.

-- ===========================================================================
-- 1) OWNER-anchored tables (owner → ownership_shares → project.organization_id)
--    owner_threads, owner_notification_prefs, owner_activity_log,
--    owner_insights
-- ===========================================================================

ALTER TABLE owner_threads
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE owner_notification_prefs
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE owner_activity_log
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE owner_insights
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- owner → the org of any villa/project the owner holds a share in.
-- A single CTE resolves one org per owner (DISTINCT ON keeps it deterministic).
WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_threads t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_notification_prefs t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_activity_log t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_insights t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 2) OWNER-STAY tables — these carry a direct villa_id, so resolve through the
--    villa first (more precise than the owner's share fan-out), then project.
--    owner_stay_requests, owner_stay_finance_links
-- ===========================================================================

ALTER TABLE owner_stay_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE owner_stay_finance_links
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE owner_stay_requests t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;

-- Fall back to owner_stay_requests.project_id where the villa join didn't yield
-- an org (defensive; villa.project_id is NOT NULL today).
UPDATE owner_stay_requests t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

UPDATE owner_stay_finance_links t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;

UPDATE owner_stay_finance_links t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 3) VILLA / PROJECT-scoped guest + content tables
--    (villa → project.organization_id, else direct project, else default)
--    villa_photos, villa_guide_sections, guest_services, guest_journey_rules
-- ===========================================================================

ALTER TABLE villa_photos
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE villa_guide_sections
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_services
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_journey_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- villa_photos (villa_id NOT NULL → villa → project)
UPDATE villa_photos t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;

-- villa_guide_sections (villa_id OR project_id; villa-first then project)
UPDATE villa_guide_sections t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE villa_guide_sections t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- guest_services (villa_id OR project_id; villa-first then project)
UPDATE guest_services t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE guest_services t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- guest_journey_rules (villa_id OR project_id; villa-first then project)
UPDATE guest_journey_rules t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE guest_journey_rules t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 4) guest_stay_tokens — booking → villa → project.organization_id
-- ===========================================================================

ALTER TABLE guest_stay_tokens
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE guest_stay_tokens t
   SET organization_id = vp.organization_id
  FROM bookings b
  JOIN villas v   ON v.id  = b.villa_id
  JOIN projects vp ON vp.id = v.project_id
 WHERE b.id = t.booking_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 5) capital_calls — project.organization_id (project_id NOT NULL)
-- ===========================================================================

ALTER TABLE capital_calls
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE capital_calls t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 6) waterfall_rules — project.organization_id; commitment-scoped rows have no
--    project, so they fall back to the default org below.
-- ===========================================================================

ALTER TABLE waterfall_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE waterfall_rules t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 7) contract_group_remind_prefs — contract_group → project.organization_id
-- ===========================================================================

ALTER TABLE contract_group_remind_prefs
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE contract_group_remind_prefs t
   SET organization_id = p.organization_id
  FROM contract_groups cg
  JOIN projects p ON p.id = cg.project_id
 WHERE cg.id = t.contract_group_id
   AND t.organization_id IS NULL;

-- ===========================================================================
-- 8) DEFAULT-ORG backfill — anything the parent chain could not resolve (no
--    share, orphaned villa, commitment-scoped waterfall rule, or an env whose
--    parents predate org tenancy) falls back to ARCONIQUE_DEFAULT. If that org
--    is absent (a bare env), the column simply stays NULL — never fail.
-- ===========================================================================

DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;

  IF default_org_id IS NOT NULL THEN
    UPDATE owner_threads                SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_notification_prefs     SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_activity_log           SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_insights               SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_stay_requests          SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_stay_finance_links     SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE villa_photos                 SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE villa_guide_sections         SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_services               SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_journey_rules          SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_stay_tokens            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE capital_calls                SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE waterfall_rules              SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE contract_group_remind_prefs  SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- ===========================================================================
-- 9) INDEXES — one per table, matching the schema-file index names.
-- ===========================================================================

CREATE INDEX IF NOT EXISTS owner_threads_organization_idx                ON owner_threads(organization_id);
CREATE INDEX IF NOT EXISTS owner_notification_prefs_organization_idx     ON owner_notification_prefs(organization_id);
CREATE INDEX IF NOT EXISTS owner_activity_log_organization_idx           ON owner_activity_log(organization_id);
CREATE INDEX IF NOT EXISTS owner_insights_organization_idx               ON owner_insights(organization_id);
CREATE INDEX IF NOT EXISTS owner_stay_requests_organization_idx          ON owner_stay_requests(organization_id);
CREATE INDEX IF NOT EXISTS owner_stay_finance_links_organization_idx     ON owner_stay_finance_links(organization_id);
CREATE INDEX IF NOT EXISTS villa_photos_organization_idx                 ON villa_photos(organization_id);
CREATE INDEX IF NOT EXISTS villa_guide_sections_organization_idx         ON villa_guide_sections(organization_id);
CREATE INDEX IF NOT EXISTS guest_services_organization_idx               ON guest_services(organization_id);
CREATE INDEX IF NOT EXISTS guest_journey_rules_organization_idx          ON guest_journey_rules(organization_id);
CREATE INDEX IF NOT EXISTS guest_stay_tokens_organization_idx            ON guest_stay_tokens(organization_id);
CREATE INDEX IF NOT EXISTS capital_calls_organization_idx                ON capital_calls(organization_id);
CREATE INDEX IF NOT EXISTS waterfall_rules_organization_idx              ON waterfall_rules(organization_id);
CREATE INDEX IF NOT EXISTS contract_group_remind_prefs_organization_idx  ON contract_group_remind_prefs(organization_id);
