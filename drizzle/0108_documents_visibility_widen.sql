-- DEMO-3-SCHEMA-2 — Widen documents.visibility CHECK to include the
-- broader STORAGE-1 spec vocabulary.
--
-- Existing CHECK: ('internal','owner','guest','public')
-- New CHECK:      ('internal','owner','guest','public',
--                  'operator_only','owner_visible','investor_visible')
--
-- Existing rows keep their values (no backfill). STORAGE-1 service
-- layer can now write the new tokens directly without aliasing
-- investor_visible → owner.

BEGIN;

ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_visibility_check";

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_visibility_check"
    CHECK ("visibility" IN (
      'internal','owner','guest','public',
      'operator_only','owner_visible','investor_visible'
    ));

COMMIT;
