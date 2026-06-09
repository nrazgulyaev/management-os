/**
 * Warehouse receiving / QC-hold record (migration 0133). One row per
 * receiving decision taken at the dock against a material PO. Powers the
 * /development-os/inventory/receiving workbench (at-dock FIFO queue +
 * PO-held QC-chain drill-in). Multi-tenant — mirrors
 * material_purchase_orders / material_deliveries (organization_id NOT NULL).
 */

import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { organizations } from "./saas";
import {
  materialPurchaseOrders,
  materialDeliveries,
} from "./site-operations";

export const RECEIVING_DECISIONS = [
  "accept_partial",
  "wait_back_order",
  "return_whole",
  "escalate_procurement",
] as const;
export type ReceivingDecision = (typeof RECEIVING_DECISIONS)[number];

export const RECEIVING_HOLD_STATUSES = ["open", "resolved", "cancelled"] as const;
export type ReceivingHoldStatus = (typeof RECEIVING_HOLD_STATUSES)[number];

export const materialReceivingHolds = pgTable(
  "material_receiving_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    poId: uuid("po_id")
      .notNull()
      .references(() => materialPurchaseOrders.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").references(() => materialDeliveries.id, {
      onDelete: "set null",
    }),
    /** accept_partial | wait_back_order | return_whole | escalate_procurement */
    decision: text("decision").notNull(),
    /** open | resolved | cancelled */
    status: text("status").notNull().default("open"),
    quantityAccepted: numeric("quantity_accepted", { precision: 15, scale: 4 })
      .notNull()
      .default("0"),
    quantityHeld: numeric("quantity_held", { precision: 15, scale: 4 })
      .notNull()
      .default("0"),
    reason: text("reason").notNull(),
    decidedBy: uuid("decided_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("material_receiving_holds_po_idx").on(t.poId),
    index("material_receiving_holds_delivery_idx").on(t.deliveryId),
    index("material_receiving_holds_status_idx").on(t.status),
    index("material_receiving_holds_org_idx").on(t.organizationId),
    index("material_receiving_holds_created_idx").on(sql`${t.createdAt} desc`),
  ],
);

export type MaterialReceivingHold = typeof materialReceivingHolds.$inferSelect;
export type MaterialReceivingHoldInsert =
  typeof materialReceivingHolds.$inferInsert;
