/**
 * Stage 4.A.3 — Procurement workflow: Purchase Request → Quotation → PO.
 *
 * Note: the table is `dev_os_purchase_requests` (not `purchase_requests`)
 * to avoid colliding with the existing Management OS `purchase_requests`
 * table from the inventory module.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  boolean,
  bigint,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { vendors, materialPurchaseOrders } from "./site-operations";
import { documents } from "./documents";
import { organizations } from "./saas";

export const devOsPurchaseRequests = pgTable(
  "dev_os_purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation). The
    // Drizzle TS schema was never updated, so INSERTs without
    // organizationId crashed with PG 23502.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestCode: text("request_code").notNull().unique(),

    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => appUsers.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    unitId: uuid("unit_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    /** Forward ref to work_packages (Stage 4.C). */
    workPackageId: uuid("work_package_id"),

    materialName: text("material_name").notNull(),
    materialCategory: text("material_category").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),

    reason: text("reason").notNull(),
    requiredByDate: date("required_by_date").notNull(),
    /** 'low' | 'normal' | 'high' | 'critical' */
    urgency: text("urgency").notNull().default("normal"),

    estimatedCostMinor: bigint("estimated_cost_minor", { mode: "bigint" }),
    estimatedCurrency: text("estimated_currency").default("IDR"),
    preferredSupplierId: uuid("preferred_supplier_id").references(
      () => vendors.id,
      { onDelete: "set null" },
    ),

    /** See migration CHECK for full enum */
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),

    generatedPoId: uuid("generated_po_id").references(
      () => materialPurchaseOrders.id,
      { onDelete: "set null" },
    ),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dev_os_purchase_requests_project_idx").on(t.projectId),
    index("dev_os_purchase_requests_status_idx").on(t.status),
    index("dev_os_purchase_requests_required_idx").on(t.requiredByDate),
    index("dev_os_purchase_requests_requested_by_idx").on(t.requestedBy),
  ],
);

export type DevOsPurchaseRequest =
  typeof devOsPurchaseRequests.$inferSelect;
export type NewDevOsPurchaseRequest =
  typeof devOsPurchaseRequests.$inferInsert;

export const procurementQuotations = pgTable(
  "procurement_quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),

    purchaseRequestId: uuid("purchase_request_id")
      .notNull()
      .references(() => devOsPurchaseRequests.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),

    quotationNumber: text("quotation_number"),
    quotedAt: date("quoted_at").notNull().defaultNow(),
    validityUntil: date("validity_until"),

    totalAmountMinor: bigint("total_amount_minor", {
      mode: "bigint",
    }).notNull(),
    currency: text("currency").notNull().default("IDR"),

    paymentTerms: text("payment_terms"),
    deliveryEstimatedDate: date("delivery_estimated_date"),
    deliveryTerms: text("delivery_terms"),

    quotationDocumentId: uuid("quotation_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),

    /** 'received' | 'under_review' | 'selected' | 'rejected' | 'expired' */
    status: text("status").notNull().default("received"),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    selectedBy: uuid("selected_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    selectionReason: text("selection_reason"),
    rejectionReason: text("rejection_reason"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("procurement_quotations_selected_unique")
      .on(t.purchaseRequestId)
      .where(sql`status = 'selected'`),
    index("procurement_quotations_request_idx").on(t.purchaseRequestId),
    index("procurement_quotations_vendor_idx").on(t.vendorId),
    index("procurement_quotations_status_idx").on(t.status),
  ],
);

export type ProcurementQuotation =
  typeof procurementQuotations.$inferSelect;
export type NewProcurementQuotation =
  typeof procurementQuotations.$inferInsert;

export const procurementQuotationLines = pgTable(
  "procurement_quotation_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => procurementQuotations.id, { onDelete: "cascade" }),

    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    /** GENERATED column; read-only at the Drizzle layer. */
    lineTotalMinor: bigint("line_total_minor", { mode: "bigint" }),

    notes: text("notes"),
  },
  (t) => [
    index("procurement_quotation_lines_quotation_idx").on(t.quotationId),
  ],
);

export type ProcurementQuotationLine =
  typeof procurementQuotationLines.$inferSelect;
export type NewProcurementQuotationLine =
  typeof procurementQuotationLines.$inferInsert;

export const approvalThresholds = pgTable(
  "approval_thresholds",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** See migration CHECK for full enum */
    thresholdType: text("threshold_type").notNull(),

    amountMinorMin: bigint("amount_minor_min", { mode: "bigint" })
      .notNull()
      .default(0n),
    amountMinorMax: bigint("amount_minor_max", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),

    /** See migration CHECK for full enum */
    requiredRole: text("required_role").notNull(),
    requiredApproverCount: integer("required_approver_count")
      .notNull()
      .default(1),

    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("approval_thresholds_type_idx").on(t.thresholdType),
    index("approval_thresholds_active_idx").on(t.isActive),
  ],
);

export type ApprovalThreshold = typeof approvalThresholds.$inferSelect;
export type NewApprovalThreshold = typeof approvalThresholds.$inferInsert;
