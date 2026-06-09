-- =============================================================================
-- 0150 · TENANCY (Development slice) — give org-less Dev tables an
--        organization_id, NULLABLE, backfilled + indexed.
--
-- SCOPE (this migration only): SCHEMA + BACKFILL + INDEX. It does NOT thread
-- organization_id into application queries and does NOT set the DB column to
-- NOT NULL. The column lands NULLABLE so the app layer can adopt it
-- incrementally (mirrors the NULLABLE tenancy style of general_ledger /
-- takeoff_measurements). Per docs/DESIGN-SYSTEM-BUILD-PROMPT.md.
--
-- TABLES (genuinely lacking org today; verified against drizzle/0072 allow-list
-- which already org-tagged boq_items / payroll_periods / team_capacity_tracking
-- / project_cycle_recommendations — those are NOT touched here):
--   rfis, submittals, coordination_pins, coordination_messages,
--   coordination_annotations, milestones, milestone_dependencies,
--   boq_actuals, boq_revisions, variance_reviews, project_permits,
--   land_profiles.
--
-- BACKFILL PARENTAGE (verified per table's real FK):
--   * project_id  -> projects.organization_id  (projects carries org from 0134):
--       rfis, submittals, coordination_pins, coordination_annotations,
--       milestones, boq_revisions, project_permits, land_profiles
--   * line_id     -> boq_items.organization_id  (boq_items carries org from 0072):
--       boq_actuals, variance_reviews
--   * from_milestone_id -> milestones.organization_id (after milestones backfill):
--       milestone_dependencies
--   * polymorphic rfi/submittal/defect -> that item's org (after their backfill):
--       coordination_messages  (defect -> qa_qc_issues.organization_id)
--   * any row still NULL after the above -> ARCONIQUE_DEFAULT seed org.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + backfill only NULLs + CREATE INDEX IF
-- NOT EXISTS. No NOT NULL is set anywhere. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add the NULLABLE column (+ FK to organizations) to each target table.
-- ---------------------------------------------------------------------------
ALTER TABLE rfis
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE coordination_pins
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE coordination_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE coordination_annotations
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE milestone_dependencies
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE boq_actuals
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE boq_revisions
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE variance_reviews
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE project_permits
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE land_profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. Backfill via each table's real parent FK (only rows still NULL).
--    Order matters: parents (milestones, rfis, submittals) before the tables
--    that derive their org from them.
-- ---------------------------------------------------------------------------

-- 2a. project_id -> projects.organization_id
UPDATE rfis r
   SET organization_id = p.organization_id
  FROM projects p
 WHERE r.project_id = p.id
   AND r.organization_id IS NULL;

UPDATE submittals s
   SET organization_id = p.organization_id
  FROM projects p
 WHERE s.project_id = p.id
   AND s.organization_id IS NULL;

UPDATE coordination_pins cp
   SET organization_id = p.organization_id
  FROM projects p
 WHERE cp.project_id = p.id
   AND cp.organization_id IS NULL;

UPDATE coordination_annotations ca
   SET organization_id = p.organization_id
  FROM projects p
 WHERE ca.project_id = p.id
   AND ca.organization_id IS NULL;

UPDATE milestones m
   SET organization_id = p.organization_id
  FROM projects p
 WHERE m.project_id = p.id
   AND m.organization_id IS NULL;

UPDATE boq_revisions br
   SET organization_id = p.organization_id
  FROM projects p
 WHERE br.project_id = p.id
   AND br.organization_id IS NULL;

UPDATE project_permits pp
   SET organization_id = p.organization_id
  FROM projects p
 WHERE pp.project_id = p.id
   AND pp.organization_id IS NULL;

UPDATE land_profiles lp
   SET organization_id = p.organization_id
  FROM projects p
 WHERE lp.project_id = p.id
   AND lp.organization_id IS NULL;

-- 2b. line_id -> boq_items.organization_id
UPDATE boq_actuals ba
   SET organization_id = bi.organization_id
  FROM boq_items bi
 WHERE ba.line_id = bi.id
   AND ba.organization_id IS NULL;

UPDATE variance_reviews vr
   SET organization_id = bi.organization_id
  FROM boq_items bi
 WHERE vr.line_id = bi.id
   AND vr.organization_id IS NULL;

-- 2c. milestone_dependencies -> milestones.organization_id (via from-side)
UPDATE milestone_dependencies md
   SET organization_id = m.organization_id
  FROM milestones m
 WHERE md.from_milestone_id = m.id
   AND md.organization_id IS NULL;

-- 2d. coordination_messages — polymorphic over rfi / submittal / defect.
UPDATE coordination_messages cm
   SET organization_id = r.organization_id
  FROM rfis r
 WHERE cm.rfi_id = r.id
   AND cm.organization_id IS NULL;

UPDATE coordination_messages cm
   SET organization_id = s.organization_id
  FROM submittals s
 WHERE cm.submittal_id = s.id
   AND cm.organization_id IS NULL;

UPDATE coordination_messages cm
   SET organization_id = q.organization_id
  FROM qa_qc_issues q
 WHERE cm.defect_id = q.id
   AND cm.organization_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Final fallback — any row still NULL (orphaned parent, missing org on the
--    parent, etc.) goes to the single ARCONIQUE_DEFAULT seed org. No-op when
--    that org is absent in an env (column simply stays NULL there).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;

  IF default_org_id IS NOT NULL THEN
    UPDATE rfis                     SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE submittals               SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE coordination_pins        SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE coordination_messages    SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE coordination_annotations SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE milestones               SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE milestone_dependencies   SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE boq_actuals              SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE boq_revisions            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE variance_reviews         SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE project_permits          SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE land_profiles            SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Per-org index on each table (idempotent).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS rfis_organization_idx                     ON rfis(organization_id);
CREATE INDEX IF NOT EXISTS submittals_organization_idx               ON submittals(organization_id);
CREATE INDEX IF NOT EXISTS coordination_pins_organization_idx        ON coordination_pins(organization_id);
CREATE INDEX IF NOT EXISTS coordination_messages_organization_idx    ON coordination_messages(organization_id);
CREATE INDEX IF NOT EXISTS coordination_annotations_organization_idx ON coordination_annotations(organization_id);
CREATE INDEX IF NOT EXISTS milestones_organization_idx               ON milestones(organization_id);
CREATE INDEX IF NOT EXISTS milestone_dependencies_organization_idx   ON milestone_dependencies(organization_id);
CREATE INDEX IF NOT EXISTS boq_actuals_organization_idx              ON boq_actuals(organization_id);
CREATE INDEX IF NOT EXISTS boq_revisions_organization_idx            ON boq_revisions(organization_id);
CREATE INDEX IF NOT EXISTS variance_reviews_organization_idx         ON variance_reviews(organization_id);
CREATE INDEX IF NOT EXISTS project_permits_organization_idx          ON project_permits(organization_id);
CREATE INDEX IF NOT EXISTS land_profiles_organization_idx            ON land_profiles(organization_id);

COMMIT;
