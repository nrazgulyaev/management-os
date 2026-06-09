/**
 * Phase 2 data-wiring PR 1 (Mgmt slice) — owner_insights.
 *
 * Surfaced on the Owners cabinet risk-ring + Owner Portal home.
 * One row per insight, dismissable. The owner-intelligence agent
 * is the primary writer (daily 05:00) but staff can fire ad-hoc
 * insights via the cabinet.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Mgmt P1.
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { owners } from "./ownership";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export type OwnerInsightKind =
  | "occupancy_trend"
  | "adr_trend"
  | "maintenance_cost"
  | "guest_satisfaction"
  | "renewal_window"
  | "contract_milestone"
  | "other";

export type OwnerInsightLevel = "info" | "watch" | "act";

export type OwnerInsightDismissedReason =
  | "acted"
  | "not_relevant"
  | "will_review"
  | "other";

export const ownerInsights = pgTable(
  "owner_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0152 add, 0158 NOT NULL): org anchor, backfilled
     *  via owner → ownership_shares → project.organization_id. Threaded into
     *  the churn-action insert paths (thread-portal unit). */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    /** Enum: occupancy_trend | adr_trend | maintenance_cost | guest_satisfaction | renewal_window | contract_milestone | other. */
    kind: text("kind").notNull(),
    /** Enum: info | watch | act — drives the ring colour. */
    level: text("level").notNull(),
    /** Context — the metric, comparison window, recommended action. */
    payload: jsonb("payload").notNull(),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedByUserId: uuid("dismissed_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Enum: acted | not_relevant | will_review | other. */
    dismissedReason: text("dismissed_reason"),
  },
  (t) => [
    index("owner_insights_owner_fired_idx").on(t.ownerId, t.firedAt),
    index("owner_insights_level_fired_idx").on(t.level, t.firedAt),
    index("owner_insights_organization_idx").on(t.organizationId),
  ],
);

export type OwnerInsight = typeof ownerInsights.$inferSelect;
export type NewOwnerInsight = typeof ownerInsights.$inferInsert;
