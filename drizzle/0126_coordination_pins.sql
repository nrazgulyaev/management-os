-- 0126 — Coordination cabinet (RFI + Submittals + Punch over a drawing).
-- Adds:
--   * submittals          — material/shop-drawing submittals (the missing register)
--   * coordination_pins    — generic (x,y %) markers on a drawing revision,
--                            each linked to ONE of rfi / submittal / defect
--   * coordination_messages — a reply thread shared by all three item kinds
-- Reuses existing tables: rfis, qa_qc_issues (defects), drawing_revisions.
-- Idempotent (CREATE … IF NOT EXISTS). Single-tenant style — mirrors
-- rfis / turnovers (no organization_id); org scoping is via project_id.

-- ── Submittals register ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "submittals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  -- human ref, e.g. SUB-EV02-0007 (unique across the platform)
  "ref" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  -- 'shop_drawing' | 'material' | 'product_data' | 'sample' | 'mockup' | 'method_statement' | 'other'
  "submittal_type" text NOT NULL,
  -- structural | architectural | mep | finishes | landscape | civil | other
  "discipline" text NOT NULL DEFAULT 'other',
  "spec_section" text,
  "description" text,
  -- vendor / subcontractor that submitted (optional)
  "vendor_id" uuid REFERENCES "vendors"("id") ON DELETE set null,
  -- lifecycle: open | submitted | under_review | approved | approved_as_noted | revise_resubmit | rejected | closed
  "status" text NOT NULL DEFAULT 'open',
  "priority" text NOT NULL DEFAULT 'medium',
  "submitted_at" timestamptz,
  "reviewed_at" timestamptz,
  "closed_at" timestamptz,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "submittals_project_idx" ON "submittals" ("project_id");
CREATE INDEX IF NOT EXISTS "submittals_status_idx" ON "submittals" ("status");
CREATE INDEX IF NOT EXISTS "submittals_discipline_idx" ON "submittals" ("discipline");
CREATE INDEX IF NOT EXISTS "submittals_created_idx" ON "submittals" ("created_at");

-- ── Drawing-pin coordinate model ──────────────────────────────────────
-- One pin = an (x,y) position (stored as 0..100 percentage of the revision
-- image) that anchors exactly one coordination item to a drawing revision.
-- The CHECK enforces "exactly one of rfi/submittal/defect".
CREATE TABLE IF NOT EXISTS "coordination_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "revision_id" uuid NOT NULL REFERENCES "drawing_revisions"("id") ON DELETE cascade,
  -- position as a percentage of the rendered image (0..100), origin top-left
  "x_pct" double precision NOT NULL,
  "y_pct" double precision NOT NULL,
  -- 'rfi' | 'submittal' | 'defect' — denormalised for cheap filtering
  "item_kind" text NOT NULL,
  "rfi_id" uuid REFERENCES "rfis"("id") ON DELETE cascade,
  "submittal_id" uuid REFERENCES "submittals"("id") ON DELETE cascade,
  "defect_id" uuid REFERENCES "qa_qc_issues"("id") ON DELETE cascade,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "coordination_pins_one_link" CHECK (
    (CASE WHEN "rfi_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "submittal_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "defect_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT "coordination_pins_pct_bounds" CHECK (
    "x_pct" >= 0 AND "x_pct" <= 100 AND "y_pct" >= 0 AND "y_pct" <= 100
  )
);

CREATE INDEX IF NOT EXISTS "coordination_pins_revision_idx" ON "coordination_pins" ("revision_id");
CREATE INDEX IF NOT EXISTS "coordination_pins_project_idx" ON "coordination_pins" ("project_id");
CREATE INDEX IF NOT EXISTS "coordination_pins_kind_idx" ON "coordination_pins" ("item_kind");
CREATE INDEX IF NOT EXISTS "coordination_pins_rfi_idx" ON "coordination_pins" ("rfi_id");
CREATE INDEX IF NOT EXISTS "coordination_pins_submittal_idx" ON "coordination_pins" ("submittal_id");
CREATE INDEX IF NOT EXISTS "coordination_pins_defect_idx" ON "coordination_pins" ("defect_id");

-- ── Shared reply thread ───────────────────────────────────────────────
-- One thread per coordination item (rfi/submittal/defect). Exactly one of
-- the three FKs is set, mirroring coordination_pins.
CREATE TABLE IF NOT EXISTS "coordination_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_kind" text NOT NULL,
  "rfi_id" uuid REFERENCES "rfis"("id") ON DELETE cascade,
  "submittal_id" uuid REFERENCES "submittals"("id") ON DELETE cascade,
  "defect_id" uuid REFERENCES "qa_qc_issues"("id") ON DELETE cascade,
  "body" text NOT NULL,
  "author_user_id" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "author_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "coordination_messages_one_link" CHECK (
    (CASE WHEN "rfi_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "submittal_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "defect_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS "coordination_messages_rfi_idx" ON "coordination_messages" ("rfi_id", "created_at");
CREATE INDEX IF NOT EXISTS "coordination_messages_submittal_idx" ON "coordination_messages" ("submittal_id", "created_at");
CREATE INDEX IF NOT EXISTS "coordination_messages_defect_idx" ON "coordination_messages" ("defect_id", "created_at");
