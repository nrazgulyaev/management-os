/**
 * Coordination cabinet (migration 0126) — drawing pins + reply threads.
 *
 * coordination_pins is a GENERIC marker model: an (x,y) position stored as a
 * 0..100 percentage of a drawing revision image, anchoring exactly one
 * coordination item (an RFI, a Submittal, or a QA/QC defect) to that revision.
 * coordination_messages is the shared reply thread, also polymorphic over the
 * same three item kinds.
 *
 * "Exactly one of rfi/submittal/defect" is enforced in the DB by CHECK
 * constraints (see drizzle/0126_coordination_pins.sql); the helper
 * `coordinationLinkColumns` keeps the write side honest in TS.
 *
 * Single-tenant style — mirrors rfis / submittals (org scoping via project_id
 * on pins; messages inherit scope from their linked item).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { drawingRevisions } from "./drawings";
import { rfis } from "./rfis";
import { submittals } from "./submittals";
import { qaQcIssues } from "./qa-qc";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const COORDINATION_ITEM_KINDS = ["rfi", "submittal", "defect"] as const;
export type CoordinationItemKind = (typeof COORDINATION_ITEM_KINDS)[number];

export const coordinationPins = pgTable(
  "coordination_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150 add + backfill; 0156 NOT NULL cutover) —
     * org column, threaded into the insert (coordination-actions.placeCoordinationPin)
     * and DB-enforced NOT NULL.
     */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => drawingRevisions.id, { onDelete: "cascade" }),
    /** Position as % of the rendered image (0..100), origin top-left. */
    xPct: doublePrecision("x_pct").notNull(),
    yPct: doublePrecision("y_pct").notNull(),
    /** Enum: COORDINATION_ITEM_KINDS — denormalised for cheap filtering. */
    itemKind: text("item_kind").notNull(),
    rfiId: uuid("rfi_id").references(() => rfis.id, { onDelete: "cascade" }),
    submittalId: uuid("submittal_id").references(() => submittals.id, {
      onDelete: "cascade",
    }),
    defectId: uuid("defect_id").references(() => qaQcIssues.id, {
      onDelete: "cascade",
    }),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("coordination_pins_revision_idx").on(t.revisionId),
    index("coordination_pins_project_idx").on(t.projectId),
    index("coordination_pins_kind_idx").on(t.itemKind),
    index("coordination_pins_rfi_idx").on(t.rfiId),
    index("coordination_pins_submittal_idx").on(t.submittalId),
    index("coordination_pins_defect_idx").on(t.defectId),
    index("coordination_pins_organization_idx").on(t.organizationId),
  ],
);

export const coordinationMessages = pgTable(
  "coordination_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150 add + backfill; 0156 NOT NULL cutover) — org
     * column. This table has no project_id; it is polymorphic over
     * rfi/submittal/defect. Threaded into the insert
     * (coordination-actions.postCoordinationReply, sourced from requireOrgId)
     * and DB-enforced NOT NULL.
     */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    /** Enum: COORDINATION_ITEM_KINDS. */
    itemKind: text("item_kind").notNull(),
    rfiId: uuid("rfi_id").references(() => rfis.id, { onDelete: "cascade" }),
    submittalId: uuid("submittal_id").references(() => submittals.id, {
      onDelete: "cascade",
    }),
    defectId: uuid("defect_id").references(() => qaQcIssues.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Snapshot of the author display name at post time. */
    authorName: text("author_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("coordination_messages_rfi_idx").on(t.rfiId, t.createdAt),
    index("coordination_messages_submittal_idx").on(t.submittalId, t.createdAt),
    index("coordination_messages_defect_idx").on(t.defectId, t.createdAt),
    index("coordination_messages_organization_idx").on(t.organizationId),
  ],
);

export type CoordinationPin = typeof coordinationPins.$inferSelect;
export type NewCoordinationPin = typeof coordinationPins.$inferInsert;
export type CoordinationMessage = typeof coordinationMessages.$inferSelect;
export type NewCoordinationMessage = typeof coordinationMessages.$inferInsert;

/**
 * Returns the link-column patch for a given (kind, id), guaranteeing exactly
 * one of rfiId / submittalId / defectId is set. Used by every write path so
 * the DB CHECK constraint never trips on a malformed insert.
 */
export function coordinationLinkColumns(
  kind: CoordinationItemKind,
  id: string,
): { rfiId: string | null; submittalId: string | null; defectId: string | null } {
  return {
    rfiId: kind === "rfi" ? id : null,
    submittalId: kind === "submittal" ? id : null,
    defectId: kind === "defect" ? id : null,
  };
}
