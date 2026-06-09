/**
 * Phase 2 data-wiring PR 3 (Owner slice) — owner_notification_prefs.
 *
 * One row per owner. Drives the Owner Portal settings page toggles.
 * Defaults match the audit (arrivalAlerts + marketingUpdates opt-in;
 * everything else opt-out).
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Owner Portal.
 */

import { boolean, index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { owners } from "./ownership";
import { organizations } from "./saas";

export const ownerNotificationPrefs = pgTable(
  "owner_notification_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0152 add, 0158 NOT NULL): org anchor, backfilled
     *  via owner → ownership_shares → project.organization_id. Threaded into
     *  the prefs upsert insert path (thread-portal unit). */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    statementReady: boolean("statement_ready").notNull().default(true),
    maintenanceUpdates: boolean("maintenance_updates").notNull().default(true),
    qReviewReminder: boolean("q_review_reminder").notNull().default(true),
    /** Opt-in per audit — defaults false. */
    arrivalAlerts: boolean("arrival_alerts").notNull().default(false),
    /** Opt-in per audit — defaults false. */
    marketingUpdates: boolean("marketing_updates").notNull().default(false),
    taxDocReady: boolean("tax_doc_ready").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("owner_notification_prefs_owner_uniq").on(t.ownerId),
    index("owner_notification_prefs_organization_idx").on(t.organizationId),
  ],
);

export type OwnerNotificationPrefs = typeof ownerNotificationPrefs.$inferSelect;
export type NewOwnerNotificationPrefs = typeof ownerNotificationPrefs.$inferInsert;
