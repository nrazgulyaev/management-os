-- 0129 — Feature-flags operational lifecycle (platform-admin cabinet).
-- The feature_flags catalog (migration 0085) carries plan-gating metadata
-- (category / is_numeric_limit / is_active) but has no operational
-- lifecycle: no per-flag owner, no rollout %, no GA/beta/internal/archived
-- staging. The /platform/feature-flags super-admin cabinet needs all three,
-- so this migration extends the existing table additively. Idempotent.
--
-- Semantics:
--   - lifecycle_status: 'internal' | 'beta' | 'ga' | 'archived'. The "kill"
--     state is derived (is_active = false), not a stored status value, so
--     a flag can be killed while preserving its underlying GA/beta stage.
--   - rollout_percent: 0..100 progressive-rollout dial. 100 = full.
--   - owner: free-text owner handle (team or person) for accountability.

ALTER TABLE "feature_flags"
  ADD COLUMN IF NOT EXISTS "lifecycle_status" text NOT NULL DEFAULT 'internal';

ALTER TABLE "feature_flags"
  ADD COLUMN IF NOT EXISTS "rollout_percent" integer NOT NULL DEFAULT 0;

ALTER TABLE "feature_flags"
  ADD COLUMN IF NOT EXISTS "owner" text;

CREATE INDEX IF NOT EXISTS "feature_flags_lifecycle_status_idx"
  ON "feature_flags" ("lifecycle_status");
