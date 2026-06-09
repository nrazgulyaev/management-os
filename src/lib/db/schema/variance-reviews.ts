/**
 * Phase 2 data-wiring PR 2 (Dev slice) — variance_reviews.
 *
 * QS variance queue. variance-detector agent (hourly + on
 * boq_actuals write) flags lines; QS reviews + decides. The
 * cost-anomaly-explainer agent (on variance flag) writes the
 * `contractorReason` payload after vendor exchange.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { boqItems } from "./boq";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export type VarianceReviewKind =
  | "over_budget"
  | "under_budget"
  | "qty_mismatch"
  | "rate_change"
  | "scope_change"
  | "other";

export type VarianceReviewDecision = "accept" | "reject" | "investigate";

export const varianceReviews = pgTable(
  "variance_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150 add + backfill; 0156 NOT NULL cutover) — org
     * column, threaded into the insert (variance-detector.run, sourced from
     * the agent's organizationId input) and DB-enforced NOT NULL.
     */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => boqItems.id, { onDelete: "cascade" }),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }).notNull().defaultNow(),
    /** Enum: over_budget | under_budget | qty_mismatch | rate_change | scope_change | other. */
    kind: text("kind").notNull(),
    /** Signed — negative = under. */
    magnitudePct: numeric("magnitude_pct", { precision: 6, scale: 3 }).notNull(),
    /** Signed in USD. */
    magnitudeUsd: numeric("magnitude_usd", { precision: 14, scale: 2 }).notNull(),
    /** Enum: accept | reject | investigate. */
    qsDecision: text("qs_decision"),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    decisionByUserId: uuid("decision_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    contractorReason: text("contractor_reason"),
    contractorReasonAt: timestamp("contractor_reason_at", { withTimezone: true }),
    qsNote: text("qs_note"),
  },
  (t) => [
    index("variance_reviews_decision_idx").on(t.qsDecision),
    index("variance_reviews_line_idx").on(t.lineId),
    index("variance_reviews_organization_idx").on(t.organizationId),
  ],
);

export type VarianceReview = typeof varianceReviews.$inferSelect;
export type NewVarianceReview = typeof varianceReviews.$inferInsert;
