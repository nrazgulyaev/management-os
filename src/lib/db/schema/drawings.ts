/**
 * Stage 5.A.1 — Drawings + revisions + distribution log.
 *
 * Defense in depth: a partial unique index on `drawing_revisions(drawing_id)
 * WHERE status = 'issued_for_construction'` enforces at most one IFC
 * revision per drawing.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { vendors } from "./site-operations";
import { appUsers } from "./identity";
import { documents } from "./documents";

export const drawings = pgTable(
  "drawings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drawingCode: text("drawing_code").notNull().unique(),
    drawingNumber: text("drawing_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    /**
     * 'architectural' | 'structural' | 'mep_electrical' | 'mep_plumbing'
     * | 'mep_hvac' | 'landscape' | 'pool' | 'site_plan' | 'detail'
     * | 'shop_drawing' | 'as_built' | 'sketch' | 'other'
     */
    drawingType: text("drawing_type").notNull(),
    /**
     * 'concept' | 'schematic_design' | 'design_development'
     * | 'permit_set' | 'construction_set' | 'as_built'
     */
    drawingPhase: text("drawing_phase"),
    authorFirm: text("author_firm"),
    authorName: text("author_name"),
    isArchived: boolean("is_archived").notNull().default(false),
    relatedWorkPackages: uuid("related_work_packages")
      .array()
      .notNull()
      .default(sql`'{}'`),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("drawings_project_idx").on(t.projectId),
    villaIdx: index("drawings_villa_idx").on(t.villaId),
    typeIdx: index("drawings_type_idx").on(t.drawingType),
    phaseIdx: index("drawings_phase_idx").on(t.drawingPhase),
    archivedIdx: index("drawings_archived_idx").on(t.isArchived),
  }),
);

export const drawingRevisions = pgTable(
  "drawing_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drawingId: uuid("drawing_id")
      .notNull()
      .references(() => drawings.id, { onDelete: "cascade" }),
    revisionLabel: text("revision_label").notNull(),
    revisionDate: date("revision_date").notNull(),
    revisionReason: text("revision_reason"),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    /**
     * 'draft' | 'for_review' | 'approved' | 'issued_for_construction'
     * | 'superseded' | 'rejected'
     */
    status: text("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNotes: text("approval_notes"),
    issuedForConstructionAt: timestamp("issued_for_construction_at", {
      withTimezone: true,
    }),
    issuedBy: uuid("issued_by").references(() => appUsers.id),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededByRevisionId: uuid("superseded_by_revision_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    drawingIdx: index("drawing_revisions_drawing_idx").on(t.drawingId),
    statusIdx: index("drawing_revisions_status_idx").on(t.status),
    drawingLabelUnique: unique().on(t.drawingId, t.revisionLabel),
  }),
);

export const drawingDistributionLog = pgTable(
  "drawing_distribution_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => drawingRevisions.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    distributedAt: timestamp("distributed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    distributedBy: uuid("distributed_by")
      .notNull()
      .references(() => appUsers.id),
    /**
     * 'whatsapp' | 'email' | 'physical_print' | 'platform_download' | 'other'
     */
    distributionMethod: text("distribution_method").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByName: text("acknowledged_by_name"),
    acknowledgmentMethod: text("acknowledgment_method"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    revisionIdx: index("drawing_distribution_log_revision_idx").on(t.revisionId),
    vendorIdx: index("drawing_distribution_log_vendor_idx").on(t.vendorId),
    revisionVendorUnique: unique().on(t.revisionId, t.vendorId),
  }),
);

export type Drawing = typeof drawings.$inferSelect;
export type NewDrawing = typeof drawings.$inferInsert;
export type DrawingRevision = typeof drawingRevisions.$inferSelect;
export type NewDrawingRevision = typeof drawingRevisions.$inferInsert;
export type DrawingDistributionLog =
  typeof drawingDistributionLog.$inferSelect;
export type NewDrawingDistributionLog =
  typeof drawingDistributionLog.$inferInsert;
