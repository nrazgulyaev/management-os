-- 0139 — Coordination cabinet DEPTH (Block 04, audit §F.2).
-- Builds on 0126 (coordination_pins / submittals / coordination_messages).
-- Adds the depth the contract names:
--   (a) SUBMITTAL → PROCUREMENT gate: a nullable submittal_id on the dev-OS
--       purchase request. When set, the PR cannot reach `po_created` until the
--       gating submittal is approved (enforced in transitionPurchaseRequest).
--   (c) Drawing markup PERSISTENCE beyond pins: coordination_annotations stores
--       the DrawingViewer freehand/measurement strokes per drawing revision as
--       JSON, so markup reloads on the viewer.
-- Idempotent (IF NOT EXISTS / guarded ADD COLUMN). Single-tenant style for the
-- annotation table (project-scoped, mirrors coordination_pins); the PR link is
-- on an already-org-scoped table.

-- ── (a) Submittal → Procurement gate link ─────────────────────────────
-- A purchase request may be gated by a material/shop-drawing submittal. NULL =
-- ungated (legacy + non-material PRs). When set, procurement transitions to
-- `po_created` are blocked until that submittal is approved.
ALTER TABLE "dev_os_purchase_requests"
  ADD COLUMN IF NOT EXISTS "gating_submittal_id" uuid
  REFERENCES "submittals"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "dev_os_purchase_requests_gating_submittal_idx"
  ON "dev_os_purchase_requests" ("gating_submittal_id");

-- ── (c) Drawing markup persistence (annotations) ──────────────────────
-- One row per drawing revision holds the full stroke set as JSON. Strokes use
-- the DrawingViewer model (kind: length | area | count | note, image-space
-- points). Upsert-on-save (one row per revision) keeps reload trivial.
CREATE TABLE IF NOT EXISTS "coordination_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "revision_id" uuid NOT NULL UNIQUE REFERENCES "drawing_revisions"("id") ON DELETE cascade,
  -- DrawingStroke[]: [{ id, kind, points:[{x,y}], label?, color? }, …]
  "strokes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Optional pixels-per-meter calibration carried with the markup.
  "scale_pixels" double precision,
  "scale_meters" double precision,
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "coordination_annotations_project_idx"
  ON "coordination_annotations" ("project_id");
