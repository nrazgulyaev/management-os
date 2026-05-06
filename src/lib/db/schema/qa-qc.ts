/**
 * Stage 4.C.1 — QA/QC defect tracking.
 *
 * Lifecycle:
 *   open → assigned → in_progress → ready_for_reinspection
 *                                      ├→ rejected → in_progress (rework)
 *                                      └→ accepted → closed
 *
 * Schema-name reconciliation: spec uses `units(id)` — actual is
 * `villas(id)` in this codebase.
 *
 * Forward-FK reservations (added in later migrations):
 *   work_package_id → work_packages(id) added in 0052
 *   related_change_order_id → change_orders(id) added in 0053
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  integer,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projects, villas } from "./projects";
import { vendors, siteReports } from "./site-operations";
import { appUsers } from "./identity";
import { documents } from "./documents";

export const qaQcCategories = pgTable(
  "qa_qc_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryKey: text("category_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    activeIdx: index("qa_qc_categories_active_idx").on(t.isActive),
    parentIdx: index("qa_qc_categories_parent_idx").on(t.parentId),
  }),
);

export const qaQcIssues = pgTable(
  "qa_qc_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueCode: text("issue_code").notNull().unique(),
    title: text("title").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    zoneReference: text("zone_reference"),
    /** FK to work_packages added in migration 0052. */
    workPackageId: uuid("work_package_id"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => qaQcCategories.id),
    /** 'low' | 'medium' | 'high' | 'critical' */
    severity: text("severity").notNull(),
    description: text("description").notNull(),
    responsibleVendorId: uuid("responsible_vendor_id").references(
      () => vendors.id,
    ),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => appUsers.id),
    assignedTo: uuid("assigned_to").references(() => appUsers.id),
    /**
     * 'open' | 'assigned' | 'in_progress' | 'ready_for_reinspection'
     * | 'rejected' | 'accepted' | 'closed'
     */
    status: text("status").notNull().default("open"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deadlineAt: date("deadline_at"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    relatedSiteReportId: uuid("related_site_report_id").references(
      () => siteReports.id,
    ),
    /** FK to change_orders added in migration 0053. */
    relatedChangeOrderId: uuid("related_change_order_id"),
    estimatedReworkCostMinor: bigint("estimated_rework_cost_minor", {
      mode: "bigint",
    }),
    actualReworkCostMinor: bigint("actual_rework_cost_minor", {
      mode: "bigint",
    }),
    currency: text("currency").default("IDR"),
    notes: text("notes"),
    /** Internal-only — never exposed to buyers/investors. */
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("qa_qc_issues_project_idx").on(t.projectId),
    villaIdx: index("qa_qc_issues_villa_idx").on(t.villaId),
    statusIdx: index("qa_qc_issues_status_idx").on(t.status),
    severityIdx: index("qa_qc_issues_severity_idx").on(t.severity),
    assignedIdx: index("qa_qc_issues_assigned_idx").on(t.assignedTo),
  }),
);

export const qaQcInspections = pgTable(
  "qa_qc_inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => qaQcIssues.id, { onDelete: "cascade" }),
    inspectionNumber: integer("inspection_number").notNull(),
    inspectorId: uuid("inspector_id")
      .notNull()
      .references(() => appUsers.id),
    inspectionDate: date("inspection_date").notNull(),
    /** 'passed' | 'failed' | 'partial_pass' */
    result: text("result").notNull(),
    resultNotes: text("result_notes"),
    /** Stage 5.A.3 — link to the formal acceptance-criteria template. */
    qualityStandardId: uuid("quality_standard_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    issueIdx: index("qa_qc_inspections_issue_idx").on(t.issueId),
    dateIdx: index("qa_qc_inspections_date_idx").on(t.inspectionDate),
    standardIdx: index("qa_qc_inspections_standard_idx").on(t.qualityStandardId),
    issueNumberUnique: unique().on(t.issueId, t.inspectionNumber),
  }),
);

export const qaQcIssuePhotos = pgTable(
  "qa_qc_issue_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => qaQcIssues.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    /**
     * 'initial_defect' | 'work_in_progress' | 'resolution_proof' | 'reinspection'
     */
    photoRole: text("photo_role").notNull(),
    inspectionId: uuid("inspection_id").references(() => qaQcInspections.id),
    caption: text("caption"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => appUsers.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    issueIdx: index("qa_qc_issue_photos_issue_idx").on(t.issueId),
    roleIdx: index("qa_qc_issue_photos_role_idx").on(t.photoRole),
  }),
);

export type QaQcCategory = typeof qaQcCategories.$inferSelect;
export type NewQaQcCategory = typeof qaQcCategories.$inferInsert;
export type QaQcIssue = typeof qaQcIssues.$inferSelect;
export type NewQaQcIssue = typeof qaQcIssues.$inferInsert;
export type QaQcInspection = typeof qaQcInspections.$inferSelect;
export type NewQaQcInspection = typeof qaQcInspections.$inferInsert;
export type QaQcIssuePhoto = typeof qaQcIssuePhotos.$inferSelect;
export type NewQaQcIssuePhoto = typeof qaQcIssuePhotos.$inferInsert;
