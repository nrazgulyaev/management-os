-- =============================================================================
-- 0174 · VILLA-PHOTO-UPLOAD — track the Supabase Storage object behind a
--        villa_photos row so a delete can also remove the underlying file.
--
-- The villa_photos table + its organization_id anchor already exist
-- (migrations 0115 + 0152). This migration ONLY adds two nullable
-- storage-tracking columns:
--   * storage_bucket — the bucket holding the object (e.g. 'villa-photos').
--   * storage_path   — object key: org/{orgId}/villa/{villaId}/{photoId}.{ext}.
--
-- Both stay NULL for externally-hosted / seed URLs (e.g. picsum); delete simply
-- skips the storage remove() when storage_path IS NULL. New uploads stamp
-- organization_id too, so a future NOT-NULL pass on that column would only need
-- to backfill the old seed rows. The public 'villa-photos' bucket is
-- provisioned at RUNTIME by ensureVillaPhotosBucket() — no DDL needed for it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. No backfill. Safe to re-run.
-- =============================================================================

ALTER TABLE villa_photos
  ADD COLUMN IF NOT EXISTS storage_bucket text;

ALTER TABLE villa_photos
  ADD COLUMN IF NOT EXISTS storage_path text;
