/**
 * Phase 2 data-wiring PR 2 (Dev slice) — boq_actuals.
 *
 * Multi-row per BOQ line: every actual recorded (delivery,
 * partial install, change order absorbed) gets its own row.
 * Aggregation lives in queries, not the table — pure event log.
 *
 * `sourcePoId` FKs to `purchase_orders` (inventory.ts) so the QS
 * workspace can pivot from "this line costs $X actual" → "from
 * which PO did this draw?".
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { boqItems } from "./boq";
import { purchaseOrders } from "./inventory";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const boqActuals = pgTable(
  "boq_actuals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150) — NULLABLE org column, backfilled via
     * line_id -> boq_items.organization_id (boq_items carries org from 0072).
     * Not yet threaded into queries and not DB-enforced NOT NULL.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => boqItems.id, { onDelete: "cascade" }),
    qtyActual: numeric("qty_actual", { precision: 14, scale: 3 }).notNull(),
    rateActual: numeric("rate_actual", { precision: 14, scale: 2 }).notNull(),
    sourcePoId: uuid("source_po_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    note: text("note"),
  },
  (t) => [
    index("boq_actuals_line_recorded_idx").on(t.lineId, t.recordedAt),
    index("boq_actuals_source_po_idx").on(t.sourcePoId),
    index("boq_actuals_organization_idx").on(t.organizationId),
  ],
);

export type BoqActual = typeof boqActuals.$inferSelect;
export type NewBoqActual = typeof boqActuals.$inferInsert;
