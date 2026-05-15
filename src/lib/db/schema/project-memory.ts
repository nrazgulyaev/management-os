/**
 * Stage 4.C.3 — Project memory + variations.
 *
 * Three tables:
 *   - project_decisions  Decision Log with supersede flow
 *   - project_risks      Risk Register with risk_score GENERATED column
 *   - change_orders      Variations / scope changes (cost+schedule impact
 *                        can be NEGATIVE for downgrade scenarios)
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { vendors } from "./site-operations";
import { workPackages } from "./work-packages";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const projectDecisions = pgTable(
  "project_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    decisionCode: text("decision_code").notNull().unique(),
    title: text("title").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    workPackageId: uuid("work_package_id").references(() => workPackages.id),
    decisionText: text("decision_text").notNull(),
    rationale: text("rationale"),
    context: text("context"),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => appUsers.id),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    decisionDate: date("decision_date").notNull(),
    approvalDate: date("approval_date"),
    relatedSupplierId: uuid("related_supplier_id").references(() => vendors.id),
    /** FK to change_orders added in same migration. */
    relatedChangeOrderId: uuid("related_change_order_id"),
    relatedDocuments: uuid("related_documents")
      .array()
      .notNull()
      .default(sql`'{}'`),
    relatedPhotos: uuid("related_photos")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** 'draft' | 'active' | 'superseded' | 'reversed' */
    status: text("status").notNull().default("active"),
    supersededBy: uuid("superseded_by"),
    category: text("category"),
    tags: text("tags").array(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_decisions_project_idx").on(t.projectId),
    statusIdx: index("project_decisions_status_idx").on(t.status),
    dateIdx: index("project_decisions_date_idx").on(t.decisionDate),
    categoryIdx: index("project_decisions_category_idx").on(t.category),
  }),
);

export const projectRisks = pgTable(
  "project_risks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    riskCode: text("risk_code").notNull().unique(),
    title: text("title").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    description: text("description").notNull(),
    /**
     * 'land_legal' | 'permit_delay' | 'weather' | 'supplier_delay'
     * | 'fx_currency' | 'buyer_payment_delay' | 'cost_overrun'
     * | 'quality_issue' | 'labor_shortage' | 'investor_funding_delay'
     * | 'tax_uncertainty' | 'design_change' | 'safety' | 'other'
     */
    category: text("category").notNull(),
    /** 'very_low' | 'low' | 'medium' | 'high' | 'very_high' */
    probability: text("probability").notNull(),
    /** 'minor' | 'moderate' | 'major' | 'severe' | 'catastrophic' */
    impact: text("impact").notNull(),
    /** GENERATED STORED in DB = probability_score × impact_score (1-25). */
    riskScore: integer("risk_score"),
    ownerId: uuid("owner_id").references(() => appUsers.id),
    mitigationPlan: text("mitigation_plan"),
    /**
     * 'identified' | 'planning_mitigation' | 'mitigating' | 'monitored'
     * | 'closed_resolved' | 'closed_realized'
     */
    mitigationStatus: text("mitigation_status").notNull().default("identified"),
    mitigationDeadline: date("mitigation_deadline"),
    estimatedCostImpactMinor: bigint("estimated_cost_impact_minor", {
      mode: "bigint",
    }),
    estimatedScheduleImpactDays: integer("estimated_schedule_impact_days"),
    relatedTasks: uuid("related_tasks").array().notNull().default(sql`'{}'`),
    relatedDecisions: uuid("related_decisions")
      .array()
      .notNull()
      .default(sql`'{}'`),
    relatedChangeOrders: uuid("related_change_orders")
      .array()
      .notNull()
      .default(sql`'{}'`),
    identifiedAt: date("identified_at").notNull(),
    closedAt: date("closed_at"),
    closedReason: text("closed_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_risks_project_idx").on(t.projectId),
    statusIdx: index("project_risks_status_idx").on(t.mitigationStatus),
    scoreIdx: index("project_risks_score_idx").on(t.riskScore),
    categoryIdx: index("project_risks_category_idx").on(t.category),
  }),
);

export const changeOrders = pgTable(
  "change_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    changeOrderCode: text("change_order_code").notNull().unique(),
    title: text("title").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    workPackageId: uuid("work_package_id").references(() => workPackages.id),
    /**
     * 'arconique_internal' | 'buyer_request' | 'investor_request'
     * | 'vendor_proposed' | 'regulatory' | 'design_correction' | 'site_condition'
     */
    initiatedByType: text("initiated_by_type").notNull(),
    initiatedByUserId: uuid("initiated_by_user_id").references(() => appUsers.id),
    initiatedByBuyerId: uuid("initiated_by_buyer_id"),
    requestedAt: date("requested_at").notNull(),
    reason: text("reason").notNull(),
    scopeChangeDescription: text("scope_change_description").notNull(),
    /** Can be negative (e.g., buyer downgrade saves money). */
    costImpactMinor: bigint("cost_impact_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    costImpactCurrency: text("cost_impact_currency").default("IDR"),
    /** Can be negative (e.g., scope reduction shortens timeline). */
    scheduleImpactDays: integer("schedule_impact_days").notNull().default(0),
    /**
     * 'requested' | 'under_review' | 'approved' | 'in_progress'
     * | 'completed' | 'rejected' | 'cancelled'
     */
    status: text("status").notNull().default("requested"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requiredApprovalRole: text("required_approval_role"),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNotes: text("approval_notes"),
    rejectionReason: text("rejection_reason"),
    implementationStart: date("implementation_start"),
    implementationFinish: date("implementation_finish"),
    relatedDrawings: uuid("related_drawings")
      .array()
      .notNull()
      .default(sql`'{}'`),
    relatedInvoices: uuid("related_invoices")
      .array()
      .notNull()
      .default(sql`'{}'`),
    relatedDecisions: uuid("related_decisions")
      .array()
      .notNull()
      .default(sql`'{}'`),
    relatedQaQcIssues: uuid("related_qa_qc_issues")
      .array()
      .notNull()
      .default(sql`'{}'`),
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
    projectIdx: index("change_orders_project_idx").on(t.projectId),
    villaIdx: index("change_orders_villa_idx").on(t.villaId),
    statusIdx: index("change_orders_status_idx").on(t.status),
    initiatedIdx: index("change_orders_initiated_idx").on(t.initiatedByType),
  }),
);

export type ProjectDecision = typeof projectDecisions.$inferSelect;
export type NewProjectDecision = typeof projectDecisions.$inferInsert;
export type ProjectRisk = typeof projectRisks.$inferSelect;
export type NewProjectRisk = typeof projectRisks.$inferInsert;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type NewChangeOrder = typeof changeOrders.$inferInsert;
