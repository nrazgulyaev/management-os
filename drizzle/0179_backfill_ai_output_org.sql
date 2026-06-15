-- =============================================================================
-- 0179 · TENANCY (AI outputs) — backfill organization_id on the two AI-output
--        HITL tables whose nullable organization_id (added by migration 0154)
--        was never stamped by their INSERT paths. Newly-created rows landed
--        org=NULL and became invisible to their own org's review queues + write
--        actions ("Analysis/Extraction not found") once the read/write actions
--        gained strict eq(organization_id) predicates.
--
-- RESOLUTION (matching the action predicates — do NOT loosen those to
-- or(eq, isNull), which would re-open the cross-tenant leak for NULL-org rows):
--   * The INSERT paths now stamp organization_id (construction-supervisor.ts
--     derives it from the report's project; document-understanding.ts from the
--     parent document). This migration repairs the EXISTING NULL-org rows.
--   * ai_construction_analyses → org via site_report -> projects.organization_id
--     (site_reports.organization_id is itself NOT NULL, but the analysis is
--     anchored to the report's project to mirror the insert-path derivation).
--   * ai_document_extractions → org via its parent document.organization_id.
--
-- Idempotent: every UPDATE is scoped to `... IS NULL`, so a re-run is a no-op
-- once rows are stamped. documents.organization_id is itself nullable, so a
-- document with a residual-null org simply leaves the extraction NULL (never
-- fails). No schema change here — the columns already exist (0154).
-- =============================================================================

BEGIN;

-- 1) ai_construction_analyses → org of the report's project.
UPDATE ai_construction_analyses a
   SET organization_id = p.organization_id
  FROM site_reports sr
  JOIN projects p ON p.id = sr.project_id
 WHERE a.site_report_id = sr.id
   AND a.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

-- 2) ai_document_extractions → org of the parent document.
UPDATE ai_document_extractions e
   SET organization_id = d.organization_id
  FROM documents d
 WHERE e.document_id = d.id
   AND e.organization_id IS NULL
   AND d.organization_id IS NOT NULL;

COMMIT;
