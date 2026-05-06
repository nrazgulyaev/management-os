/**
 * Stage 4.A.2 — Configurable tax types + period reports.
 *
 * Tax rates are NOT hardcoded. Operators add tax types as needed
 * (PPN, PPh23, lease tax, corporate income tax, etc.). Each
 * `dev_transactions` row references a tax_type via the new
 * `tax_type_id` column added in migration 0046.
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
import { appUsers } from "./identity";

export const taxTypes = pgTable(
  "tax_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    typeKey: text("type_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),

    ratePercentage: numeric("rate_percentage", {
      precision: 7,
      scale: 4,
    }).notNull(),
    isIncludedInAmount: boolean("is_included_in_amount")
      .notNull()
      .default(false),

    /** ['expense', 'invoice', 'receipt'] etc. */
    appliesToTransactionTypes: text("applies_to_transaction_types").array(),
    /** dev_cost_categories.id list (empty = all categories) */
    appliesToCategories: uuid("applies_to_categories").array(),
    excludedCategories: uuid("excluded_categories").array(),

    /** 'company' | 'supplier' | 'buyer' | 'investor' | 'split' */
    payableBy: text("payable_by").notNull(),
    /** 'monthly' | 'quarterly' | 'annual' | 'on_demand' */
    reportingPeriod: text("reporting_period").notNull().default("monthly"),
    reportingAuthority: text("reporting_authority"),

    countryCode: text("country_code").default("ID"),
    regionCode: text("region_code"),

    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    effectiveUntil: date("effective_until"),

    aiClassificationHint: text("ai_classification_hint"),

    notes: text("notes"),
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
    index("tax_types_active_idx").on(t.isActive),
    index("tax_types_country_idx").on(t.countryCode),
  ],
);

export type TaxType = typeof taxTypes.$inferSelect;
export type NewTaxType = typeof taxTypes.$inferInsert;

export const taxPeriodReports = pgTable(
  "tax_period_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taxTypeId: uuid("tax_type_id")
      .notNull()
      .references(() => taxTypes.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),

    totalTaxableAmountMinor: bigint("total_taxable_amount_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    totalTaxAmountMinor: bigint("total_tax_amount_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    transactionCount: integer("transaction_count").notNull().default(0),
    unclassifiedTransactionCount: integer(
      "unclassified_transaction_count",
    )
      .notNull()
      .default(0),

    /** 'draft' | 'finalized' | 'submitted' | 'amended' | 'archived' */
    status: text("status").notNull().default("draft"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedBy: uuid("finalized_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    notes: text("notes"),

    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tax_period_reports_period_idx").on(t.periodStart, t.periodEnd),
    index("tax_period_reports_status_idx").on(t.status),
  ],
);

export type TaxPeriodReport = typeof taxPeriodReports.$inferSelect;
export type NewTaxPeriodReport = typeof taxPeriodReports.$inferInsert;
