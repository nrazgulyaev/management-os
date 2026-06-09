-- =============================================================================
-- 0156 · TENANCY (Development slice) — NOT NULL cutover for organization_id.
--
-- SCOPE: flip `organization_id` to NOT NULL on the Development-domain tables
-- whose column was added + backfilled NULLABLE in migration 0150, and whose
-- every application-layer insert site now sets organization_id (threaded in
-- unit `thread-dev`):
--
--   rfis ...................... rfi-actions.composeRfi
--                              + coordination-actions.createCoordinationRfi
--   submittals ............... coordination-actions.createSubmittal
--   coordination_pins ........ coordination-actions.placeCoordinationPin
--   coordination_messages .... coordination-actions.postCoordinationReply
--                              (polymorphic; sourced from requireOrgId)
--   coordination_annotations . coordination-actions.saveCoordinationAnnotations
--   milestones ............... project-milestone-actions.createMilestone
--   milestone_dependencies ... project-milestone-actions.createMilestone
--                              (child rows; copy parent milestone's org)
--   boq_actuals .............. no app-layer insert site today (read-only);
--                              backfilled from boq_items — trivially covered
--   boq_revisions ............ no app-layer insert site today (read-only);
--                              backfilled from projects — trivially covered
--   variance_reviews ......... variance-detector.run (agent organizationId)
--   project_permits .......... permit-actions.createPermit + seed-dev-os.mjs
--   land_profiles ............ land-actions.upsertLandProfile + seed-dev-os.mjs
--
-- The platform is SINGLE-TENANT today (one ARCONIQUE_DEFAULT org); the 0150
-- backfill already populated every row, so this cutover is the DB-enforcement
-- half of the app-layer threading. The Drizzle schema is flipped to .notNull()
-- in lock-step (see src/lib/db/schema/{rfis,submittals,coordination,
-- coordination-annotations,milestones,boq-actuals,boq-revisions,
-- variance-reviews,permits,land}.ts).
--
-- GUARDED per table: each ALTER runs ONLY IF the column exists (0150 applied)
-- AND no row still has organization_id IS NULL. So this migration NEVER fails —
-- it no-ops on a DB where 0150 hasn't run yet or where a stray row is unscoped,
-- and re-running is harmless (SET NOT NULL is idempotent). Mirrors the guarded
-- cutover style used across the tenancy slices.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'rfis',
    'submittals',
    'coordination_pins',
    'coordination_messages',
    'coordination_annotations',
    'milestones',
    'milestone_dependencies',
    'boq_actuals',
    'boq_revisions',
    'variance_reviews',
    'project_permits',
    'land_profiles'
  ];
  null_count bigint;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only proceed if the column exists (0150 applied in this env).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = t
         AND column_name = 'organization_id'
    ) THEN
      -- Only flip if no row is still unscoped (guard against a partial backfill).
      EXECUTE format('SELECT count(*) FROM %I WHERE organization_id IS NULL', t)
        INTO null_count;
      IF null_count = 0 THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL', t);
        RAISE NOTICE '0156: % organization_id SET NOT NULL', t;
      ELSE
        RAISE NOTICE '0156: % left NULLABLE (% unscoped row(s))', t, null_count;
      END IF;
    ELSE
      RAISE NOTICE '0156: % skipped (organization_id column absent — apply 0150 first)', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
