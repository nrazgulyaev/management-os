-- Migration 0140 — takeoff_measurements
--
-- Block 09 ESTIMATOR (audit §F.2). DEEPENS the existing drawing-takeoff
-- workbench (PRs #133/#134/#138 + mount-estimator-knowledge), which until now
-- could only PUSH a one-way line into boq_items: the measured geometry, the
-- rate, the unit, and the link back to the drawing it was measured on all lived
-- in throwaway client state. There was no round-trip — you could not re-open a
-- takeoff, edit/delete a measurement, re-cost it, or know a takeoff went stale
-- because a newer drawing revision landed.
--
-- This table is the persistence layer for that round-trip. One row = one
-- measurement (area / length / count) taken on a specific drawing REVISION:
--   * geometry is stored as JSONB image-space points + a scale snapshot, so the
--     quantity can be re-derived (and re-costed) deterministically later;
--   * the measured quantity is materialised (raw_quantity) for fast costing;
--   * unit_rate_minor + currency cost the measurement (bigint MINOR money);
--   * boq_item_id is the round-trip link to the boq_items row this measurement
--     was pushed into (NULL until pushed, set NULL again if the BOQ line is
--     deleted — the FK is ON DELETE SET NULL so the takeoff survives);
--   * drawing_revision_id pins the takeoff to the exact revision it was measured
--     on, so a newer revision on the same drawing flags the takeoff as STALE
--     (derived at read time — no denormalised flag to drift).
--
-- No PSP / no real money movement: this only computes estimate quantities ×
-- rates. Org-scoped, idempotent.

CREATE TABLE IF NOT EXISTS takeoff_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  -- The drawing revision this measurement was taken on. A NEWER revision on
  -- the same drawing makes this takeoff stale (derived in the reader).
  drawing_revision_id uuid NOT NULL
    REFERENCES drawing_revisions(id) ON DELETE CASCADE,
  -- Round-trip link to the costed BOQ line. NULL until pushed; SET NULL if the
  -- BOQ line is later deleted so the takeoff itself is never orphaned away.
  boq_item_id uuid REFERENCES boq_items(id) ON DELETE SET NULL,
  -- The BOQ section a push targets (kept so a re-push after a revision goes to
  -- the same section without re-asking).
  boq_section_id uuid REFERENCES boq_sections(id) ON DELETE SET NULL,
  -- Estimator-facing label, e.g. "Floor screed — bedroom 1".
  label text NOT NULL DEFAULT '',
  -- 'area' | 'length' | 'count'.
  kind text NOT NULL,
  -- Explicit unit of measure: m2 / m / ea (or an override the estimator typed).
  unit_of_measure text NOT NULL,
  -- Optional assembly / rate-library key (free text for now — an org rate
  -- library is a later slice; this records the intent so it can be linked up).
  assembly text,
  -- The measured quantity, materialised for costing. NUMERIC(14,4) mirrors
  -- boq_items.quantity precision.
  raw_quantity numeric(14,4) NOT NULL DEFAULT 0,
  -- Unit rate in MINOR currency units (bigint). quantity * rate = line cost.
  unit_rate_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  -- Image-space geometry points [{x,y}, ...] so the quantity can be recomputed.
  geometry jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Scale snapshot at measurement time: { pixels, meters }. NULL for counts.
  scale_snapshot jsonb,
  notes text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS takeoff_measurements_org_idx
  ON takeoff_measurements (organization_id);
CREATE INDEX IF NOT EXISTS takeoff_measurements_revision_idx
  ON takeoff_measurements (drawing_revision_id);
CREATE INDEX IF NOT EXISTS takeoff_measurements_boq_item_idx
  ON takeoff_measurements (boq_item_id);
CREATE INDEX IF NOT EXISTS takeoff_measurements_section_idx
  ON takeoff_measurements (boq_section_id);
