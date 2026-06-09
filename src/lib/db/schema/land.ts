/**
 * Stage 4.A.1 — Land Profile + payment schedules + transaction costs.
 *
 * One `land_profiles` row per project (UNIQUE on project_id). The
 * payment schedule + installments + transaction costs hang off the
 * profile so a project's full land lifecycle stays addressable from a
 * single root.
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
import { projects } from "./projects";
import { vendors } from "./site-operations";
import { devTransactions } from "./dev-finance";
import { organizations } from "./saas";

export const landProfiles = pgTable(
  "land_profiles",
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
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),

    /**
     * 'leasehold' | 'freehold' | 'joint_venture' | 'landowner_partnership'
     * | 'nominee' | 'revenue_share' | 'custom'
     */
    acquisitionMode: text("acquisition_mode").notNull(),
    acquisitionModeNotes: text("acquisition_mode_notes"),

    landCertificateReference: text("land_certificate_reference"),
    plotName: text("plot_name"),
    acquisitionDate: date("acquisition_date"),

    leaseStartDate: date("lease_start_date"),
    leaseExpiryDate: date("lease_expiry_date"),
    leaseTenureYears: integer("lease_tenure_years"),
    leaseExtensionOption: boolean("lease_extension_option"),
    leaseExtensionTerms: text("lease_extension_terms"),

    totalLandSizeAre: numeric("total_land_size_are", {
      precision: 10,
      scale: 4,
    }),
    totalLandSizeSqm: numeric("total_land_size_sqm", {
      precision: 12,
      scale: 2,
    }),
    grossLandAreaSqm: numeric("gross_land_area_sqm", {
      precision: 12,
      scale: 2,
    }),
    netUsableLandAreaSqm: numeric("net_usable_land_area_sqm", {
      precision: 12,
      scale: 2,
    }),
    landPerUnitSqm: numeric("land_per_unit_sqm", {
      precision: 12,
      scale: 2,
    }),

    roadDeductionsSqm: numeric("road_deductions_sqm", {
      precision: 12,
      scale: 2,
    }),
    commonAreaDeductionsSqm: numeric("common_area_deductions_sqm", {
      precision: 12,
      scale: 2,
    }),
    setbackDeductionsSqm: numeric("setback_deductions_sqm", {
      precision: 12,
      scale: 2,
    }),

    zoningClassification: text("zoning_classification"),
    zoningNotes: text("zoning_notes"),
    topographyNotes: text("topography_notes"),
    soilGeotechnicalNotes: text("soil_geotechnical_notes"),
    utilityAccessNotes: text("utility_access_notes"),

    /**
     * 'pending' | 'in_progress' | 'completed' | 'issues_identified' | 'not_required'
     */
    dueDiligenceStatus: text("due_diligence_status")
      .notNull()
      .default("pending"),
    dueDiligenceCompletedAt: date("due_diligence_completed_at"),
    dueDiligenceNotes: text("due_diligence_notes"),

    responsibleLegalConsultant: text("responsible_legal_consultant"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("land_profiles_project_idx").on(t.projectId),
    index("land_profiles_organization_idx").on(t.organizationId),
    index("land_profiles_lease_expiry_idx")
      .on(t.leaseExpiryDate)
      .where(sql`${t.leaseExpiryDate} IS NOT NULL`),
  ],
);

export type LandProfile = typeof landProfiles.$inferSelect;
export type NewLandProfile = typeof landProfiles.$inferInsert;

export const landPaymentSchedules = pgTable(
  "land_payment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    landProfileId: uuid("land_profile_id")
      .notNull()
      .references(() => landProfiles.id, { onDelete: "cascade" }),

    totalPurchasePriceMinor: bigint("total_purchase_price_minor", {
      mode: "bigint",
    }).notNull(),
    currency: text("currency").notNull().default("USD"),

    upfrontPaymentMinor: bigint("upfront_payment_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    balancePaymentMinor: bigint("balance_payment_minor", { mode: "bigint" })
      .notNull()
      .default(0n),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("land_payment_schedules_profile_idx").on(t.landProfileId),
  ],
);

export type LandPaymentSchedule = typeof landPaymentSchedules.$inferSelect;
export type NewLandPaymentSchedule =
  typeof landPaymentSchedules.$inferInsert;

export const landPaymentInstallments = pgTable(
  "land_payment_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => landPaymentSchedules.id, { onDelete: "cascade" }),

    installmentNumber: integer("installment_number").notNull(),
    dueDate: date("due_date").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),

    /** 'pending' | 'paid' | 'partial' | 'overdue' | 'cancelled' */
    status: text("status").notNull().default("pending"),
    paidDate: date("paid_date"),
    paidAmountMinor: bigint("paid_amount_minor", { mode: "bigint" }).default(
      0n,
    ),
    paymentMethod: text("payment_method"),
    counterparty: text("counterparty"),

    relatedTransactionId: uuid("related_transaction_id").references(
      () => devTransactions.id,
      { onDelete: "set null" },
    ),
    /**
     * Forward ref to dev_invoices (Stage 4.A.2). FK added in 0046 since
     * dev_invoices didn't exist when this table was created.
     */
    relatedInvoiceId: uuid("related_invoice_id"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("land_payment_installments_schedule_idx").on(t.scheduleId),
    index("land_payment_installments_due_idx").on(t.dueDate),
    index("land_payment_installments_status_idx").on(t.status),
  ],
);

export type LandPaymentInstallment =
  typeof landPaymentInstallments.$inferSelect;
export type NewLandPaymentInstallment =
  typeof landPaymentInstallments.$inferInsert;

export const landTransactionCosts = pgTable(
  "land_transaction_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    landProfileId: uuid("land_profile_id")
      .notNull()
      .references(() => landProfiles.id, { onDelete: "cascade" }),

    /** See migration CHECK for full enum */
    costType: text("cost_type").notNull(),
    costLabel: text("cost_label").notNull(),

    plannedAmountMinor: bigint("planned_amount_minor", { mode: "bigint" }),
    actualAmountMinor: bigint("actual_amount_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),

    dueDate: date("due_date"),
    paidDate: date("paid_date"),
    /** 'planned' | 'committed' | 'paid' | 'cancelled' */
    status: text("status").notNull().default("planned"),

    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    relatedTransactionId: uuid("related_transaction_id").references(
      () => devTransactions.id,
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
    index("land_transaction_costs_profile_idx").on(t.landProfileId),
    index("land_transaction_costs_status_idx").on(t.status),
  ],
);

export type LandTransactionCost = typeof landTransactionCosts.$inferSelect;
export type NewLandTransactionCost =
  typeof landTransactionCosts.$inferInsert;
