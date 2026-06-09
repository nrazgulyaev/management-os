-- 0125 — Procure-to-pay money lifecycle (P0 procurement-money).
-- The existing `material_purchase_orders.status` column already tracks the
-- DELIVERY lifecycle (draft | ordered | partially_delivered |
-- fully_delivered | cancelled). What was missing — and what the design
-- showed but the live UI never wired — is the MONEY lifecycle: placing the
-- order, confirming receipt at the PO level, and a MANUAL mark-paid
-- (PSP / Indonesia rails deferred). These additive columns hang the
-- payment state off the existing PO row. Idempotent (ADD COLUMN IF NOT
-- EXISTS) — safe to re-run.

ALTER TABLE "material_purchase_orders"
  -- payment lifecycle: unpaid | partially_paid | paid
  ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'unpaid';

ALTER TABLE "material_purchase_orders"
  -- accumulated MANUAL payments against this PO, in USD minor units.
  -- Derived from dev_transactions outflows but cached here for fast reads.
  ADD COLUMN IF NOT EXISTS "paid_amount_usd_minor" bigint NOT NULL DEFAULT 0;

ALTER TABLE "material_purchase_orders"
  -- when the operator placed the order (draft -> ordered).
  ADD COLUMN IF NOT EXISTS "placed_at" timestamptz;

ALTER TABLE "material_purchase_orders"
  -- when the operator confirmed receipt at the PO level (money milestone,
  -- distinct from the line-level material_deliveries flow).
  ADD COLUMN IF NOT EXISTS "received_at" timestamptz;

CREATE INDEX IF NOT EXISTS "material_pos_payment_status_idx"
  ON "material_purchase_orders" ("payment_status");
