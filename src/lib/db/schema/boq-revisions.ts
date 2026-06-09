/**
 * Phase 2 data-wiring PR 2 (Dev slice) — boq_revisions.
 *
 * Point-in-time BOQ snapshot. Existing `boqItems` (from boq.ts)
 * holds the CURRENT revision; this table tracks history. `replacesId`
 * forms a self-FK chain so the QS workspace can show "what did the
 * previous version look like?".
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const boqRevisions = pgTable(
  "boq_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150) — NULLABLE org column, backfilled via
     * project_id -> projects.organization_id. Not yet threaded into queries
     * and not DB-enforced NOT NULL; the app still org-scopes via project_id.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
    /** Chain of revisions — null for the first snapshot. */
    replacesId: uuid("replaces_id").references((): AnyPgColumn => boqRevisions.id, {
      onDelete: "set null",
    }),
    committedByUserId: uuid("committed_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Frozen line items + totals as of snapshot_at. */
    snapshot: jsonb("snapshot").notNull(),
    note: text("note"),
  },
  (t) => [
    index("boq_revisions_project_version_idx").on(t.projectId, t.version),
    unique("boq_revisions_project_version_uniq").on(t.projectId, t.version),
    index("boq_revisions_organization_idx").on(t.organizationId),
  ],
);

export type BoqRevision = typeof boqRevisions.$inferSelect;
export type NewBoqRevision = typeof boqRevisions.$inferInsert;
