-- 0133 — Warehouse receiving / QC-hold record (warehouse-receiving unit).
-- One row per receiving decision taken at the dock against a material PO.
-- Drives the /development-os/inventory/receiving workbench: the at-dock
-- FIFO queue surfaces open POs awaiting receipt; the QC-chain drill-in
-- records the receiver's decision (accept_partial | wait_back_order |
-- return_whole | escalate_procurement) as an auditable hold.
--
-- Multi-tenant (mirrors material_purchase_orders / material_deliveries —
-- organization_id NOT NULL). Idempotent.

CREATE TABLE IF NOT EXISTS "material_receiving_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "po_id" uuid NOT NULL REFERENCES "material_purchase_orders"("id") ON DELETE cascade,
  -- optional link to the delivery row that this decision relates to
  "delivery_id" uuid REFERENCES "material_deliveries"("id") ON DELETE set null,
  -- decision: accept_partial | wait_back_order | return_whole | escalate_procurement
  "decision" text NOT NULL,
  -- decision lifecycle: open | resolved | cancelled
  "status" text NOT NULL DEFAULT 'open',
  -- quantities counted at the dock (advisory totals, numeric to match po_lines)
  "quantity_accepted" numeric(15, 4) NOT NULL DEFAULT '0',
  "quantity_held" numeric(15, 4) NOT NULL DEFAULT '0',
  "reason" text NOT NULL,
  "decided_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "material_receiving_holds_po_idx"
  ON "material_receiving_holds" ("po_id");
CREATE INDEX IF NOT EXISTS "material_receiving_holds_delivery_idx"
  ON "material_receiving_holds" ("delivery_id");
CREATE INDEX IF NOT EXISTS "material_receiving_holds_status_idx"
  ON "material_receiving_holds" ("status");
CREATE INDEX IF NOT EXISTS "material_receiving_holds_org_idx"
  ON "material_receiving_holds" ("organization_id");
CREATE INDEX IF NOT EXISTS "material_receiving_holds_created_idx"
  ON "material_receiving_holds" ("created_at" DESC);
