/**
 * Stage 4.A.2 — Invoice entity (vendor bills, milestone invoices, capital calls).
 *
 * Lives in PARALLEL with `capital_commitments`. Commitments represent
 * capital pledges from investors; invoices represent actual bills /
 * milestone payments / capital-call invoices. They never overlap.
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { vendors, materialPurchaseOrders } from "./site-operations";
import { contacts } from "./contacts";
import { investors, capitalCommitments } from "./investor-capital";
import { documents } from "./documents";
import { devCostCategories } from "./dev-finance";
import { taxTypes } from "./tax";
import { landPaymentInstallments } from "./land";
import { projectPermits } from "./permits";
import { organizations } from "./saas";

export const devInvoices = pgTable(
  "dev_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),

    invoiceNumber: text("invoice_number").notNull(),
    externalReference: text("external_reference"),

    /** 'payable' | 'receivable' | 'investor_call' | 'internal' */
    invoiceType: text("invoice_type").notNull(),

    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    buyerContactId: uuid("buyer_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    investorId: uuid("investor_id").references(() => investors.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** Schema's "units" are `villas` in this codebase. */
    unitId: uuid("unit_id").references(() => villas.id, {
      onDelete: "set null",
    }),

    relatedPoId: uuid("related_po_id").references(
      () => materialPurchaseOrders.id,
      { onDelete: "set null" },
    ),
    relatedCommitmentId: uuid("related_commitment_id").references(
      () => capitalCommitments.id,
      { onDelete: "set null" },
    ),
    /** Forward ref to a future contracts entity. Plain UUID for now. */
    relatedContractId: uuid("related_contract_id"),
    relatedLandInstallmentId: uuid("related_land_installment_id").references(
      () => landPaymentInstallments.id,
      { onDelete: "set null" },
    ),
    relatedPermitId: uuid("related_permit_id").references(
      () => projectPermits.id,
      { onDelete: "set null" },
    ),

    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),

    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(),
    taxTotalMinor: bigint("tax_total_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    paidMinor: bigint("paid_minor", { mode: "bigint" }).notNull().default(0n),
    /** GENERATED column owned by the migration; read-only at the Drizzle layer. */
    outstandingMinor: bigint("outstanding_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),
    fxRateToUsd: numeric("fx_rate_to_usd", { precision: 15, scale: 8 }),

    /** See migration CHECK for full enum */
    status: text("status").notNull().default("draft"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),

    taxTypeId: uuid("tax_type_id").references(() => taxTypes.id, {
      onDelete: "set null",
    }),
    taxClassificationNotes: text("tax_classification_notes"),

    paymentTerms: text("payment_terms"),

    primaryDocumentId: uuid("primary_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),

    notes: text("notes"),
    internalNotes: text("internal_notes"),

    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dev_invoices_vendor_idx").on(t.vendorId),
    index("dev_invoices_buyer_idx").on(t.buyerContactId),
    index("dev_invoices_investor_idx").on(t.investorId),
    index("dev_invoices_project_idx").on(t.projectId),
    index("dev_invoices_status_idx").on(t.status),
    index("dev_invoices_issued_idx").on(sql`${t.issueDate} desc`),
  ],
);

export type DevInvoice = typeof devInvoices.$inferSelect;
export type NewDevInvoice = typeof devInvoices.$inferInsert;

export const devInvoiceLines = pgTable(
  "dev_invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => devInvoices.id, { onDelete: "cascade" }),

    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),

    quantity: numeric("quantity", { precision: 12, scale: 4 }).default("1"),
    unitOfMeasure: text("unit_of_measure"),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    /** GENERATED column; read-only at the Drizzle layer. */
    lineSubtotalMinor: bigint("line_subtotal_minor", { mode: "bigint" }),

    costCategoryId: uuid("cost_category_id").references(
      () => devCostCategories.id,
      { onDelete: "set null" },
    ),
    unitId: uuid("unit_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    /** Forward ref to work_packages (Stage 4.C). */
    workPackageId: uuid("work_package_id"),

    taxTypeId: uuid("tax_type_id").references(() => taxTypes.id, {
      onDelete: "set null",
    }),
    taxAmountMinor: bigint("tax_amount_minor", { mode: "bigint" }).default(0n),
    isTaxIncluded: boolean("is_tax_included").default(false),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dev_invoice_lines_invoice_idx").on(t.invoiceId),
    index("dev_invoice_lines_category_idx").on(t.costCategoryId),
  ],
);

export type DevInvoiceLine = typeof devInvoiceLines.$inferSelect;
export type NewDevInvoiceLine = typeof devInvoiceLines.$inferInsert;
