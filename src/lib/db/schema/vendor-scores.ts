/**
 * Phase 2 data-wiring PR 2 (Dev slice) — vendor_scores.
 *
 * History pattern — one new row per nightly recompute. Don't
 * UPDATE; the vendor-score-updater agent INSERTs and the trailing
 * sparkline reads back the last N rows. This avoids losing the
 * audit trail when the scoring algorithm changes.
 *
 * FK to `vendors` (site-operations.ts), NOT `contacts` — the
 * RFQ + procurement chain already anchors on the vendors table.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { vendors } from "./site-operations";

export const vendorScores = pgTable(
  "vendor_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    /** 0..100 composite. */
    composite: integer("composite").notNull(),
    priceScore: integer("price_score").notNull(),
    onTimeScore: integer("on_time_score").notNull(),
    qaScore: integer("qa_score").notNull(),
    responsiveScore: integer("responsive_score").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    /** Scoring window — default trailing_90d. Future windows may add trailing_180d, etc. Column renamed from `window` to avoid the Postgres reserved word. */
    scoreWindow: text("score_window").notNull().default("trailing_90d"),
  },
  (t) => [
    index("vendor_scores_vendor_computed_desc_idx").on(t.vendorId, t.computedAt),
    index("vendor_scores_computed_at_idx").on(t.computedAt),
  ],
);

export type VendorScore = typeof vendorScores.$inferSelect;
export type NewVendorScore = typeof vendorScores.$inferInsert;
