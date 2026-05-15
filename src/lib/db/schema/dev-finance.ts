import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { contacts } from "./contacts";
import { documents } from "./documents";
import { organizations } from "./saas";
import {
  capitalDrawdowns,
  distributions,
} from "./investor-capital";

/**
 * Development OS — Stage 2.3 schema (development finance ledger cluster).
 *
 * Tables here are prefixed `dev_*` because they have conceptual peers in
 * Management OS (notification_*, etc) and we need a stable namespace for
 * Development OS-only audit/financial tables.
 *
 * The three-state cost ledger uses three of these tables:
 *   - dev_budget_lines      → Budgeted (planned)
 *   - dev_commitments_ledger → Committed (signed POs)
 *   - dev_transactions       → Actual (cash out the door)
 *
 * Money is BIGINT minor units, USD canonical, FX snapshot at event time.
 */

// -----------------------------------------------------------------------------
// 8) dev_bank_accounts
// -----------------------------------------------------------------------------

export const devBankAccounts = pgTable(
  "dev_bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation). The
    // Drizzle TS schema was never updated, so INSERTs without
    // organizationId crashed with PG 23502. Reflecting the DB column
    // here unblocks the actions; nothing about the DB changes.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountCode: text("account_code").notNull().unique(),
    accountName: text("account_name").notNull(),
    /** 'bank' | 'crypto_exchange' | 'crypto_wallet' | 'cash' */
    accountType: text("account_type").notNull(),
    /** 'USD' | 'IDR' | 'RUB' | 'EUR' | 'USDT' | 'CNY' */
    currency: text("currency").notNull(),

    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    swiftCode: text("swift_code"),
    iban: text("iban"),
    walletAddress: text("wallet_address"),

    minimumBalanceThresholdMinor: bigint("minimum_balance_threshold_minor", {
      mode: "bigint",
    }),
    currentBalanceMinor: bigint("current_balance_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currentBalanceUsdMinor: bigint("current_balance_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    lastFxRate: numeric("last_fx_rate", { precision: 20, scale: 8 }),
    lastBalanceAt: timestamp("last_balance_at", { withTimezone: true }),

    primaryProjectId: uuid("primary_project_id").references(() => projects.id, {
      onDelete: "restrict",
    }),
    isCompanyAccount: boolean("is_company_account").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /** Stage 2.3.B — set by `runMinimumBalanceAlert` to enforce 24h cooldown. */
    lastBalanceAlertAt: timestamp("last_balance_alert_at", {
      withTimezone: true,
    }),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dev_bank_accounts_currency_idx").on(t.currency),
    index("dev_bank_accounts_project_idx").on(t.primaryProjectId),
  ],
);

export type DevBankAccount = typeof devBankAccounts.$inferSelect;
export type DevBankAccountInsert = typeof devBankAccounts.$inferInsert;

// -----------------------------------------------------------------------------
// 9) dev_cost_categories
// -----------------------------------------------------------------------------

export const devCostCategories = pgTable(
  "dev_cost_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: same as dev_bank_accounts — migration 0072 added
    // organization_id NOT NULL, Drizzle TS lagged.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    categoryCode: text("category_code").notNull().unique(),
    parentCategoryId: uuid("parent_category_id"),
    displayName: text("display_name").notNull(),
    /** {"en":"...","ru":"...","id":"..."} */
    displayNameTranslations: jsonb("display_name_translations"),
    /**
     * 'capex' | 'opex' | 'cogs' | 'fee_income' | 'sale_income'
     * | 'rental_income' | 'corporate_event'
     */
    categoryType: text("category_type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(100),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dev_cost_categories_parent_idx").on(t.parentCategoryId),
    index("dev_cost_categories_type_idx").on(t.categoryType),
  ],
);

export type DevCostCategory = typeof devCostCategories.$inferSelect;
export type DevCostCategoryInsert = typeof devCostCategories.$inferInsert;

// -----------------------------------------------------------------------------
// 10) dev_budget_lines
// -----------------------------------------------------------------------------

export const devBudgetLines = pgTable(
  "dev_budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => devCostCategories.id, { onDelete: "restrict" }),
    /** NULL = project-level allocation; UUID = villa-level */
    unitId: uuid("unit_id").references(() => villas.id, {
      onDelete: "restrict",
    }),

    budgetedAmountUsdMinor: bigint("budgeted_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),
    budgetedAtCurrency: text("budgeted_at_currency")
      .notNull()
      .default("USD"),
    budgetedAmountOriginalMinor: bigint("budgeted_amount_original_minor", {
      mode: "bigint",
    }),
    budgetedFxRate: numeric("budgeted_fx_rate", { precision: 20, scale: 8 }),

    budgetVersion: integer("budget_version").notNull().default(1),
    effectiveFrom: date("effective_from").notNull(),
    /** When non-NULL, this budget line has been replaced by a newer version */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededById: uuid("superseded_by_id"),

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
    index("dev_budget_lines_project_idx").on(t.projectId),
    index("dev_budget_lines_category_idx").on(t.categoryId),
    index("dev_budget_lines_unit_idx").on(t.unitId),
  ],
);

export type DevBudgetLine = typeof devBudgetLines.$inferSelect;
export type DevBudgetLineInsert = typeof devBudgetLines.$inferInsert;

// -----------------------------------------------------------------------------
// 11) dev_commitments_ledger — POs / vendor contracts (NOT investor commitments)
// -----------------------------------------------------------------------------

export const devCommitmentsLedger = pgTable(
  "dev_commitments_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => devCostCategories.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id").references(() => villas.id, {
      onDelete: "restrict",
    }),

    commitmentCode: text("commitment_code").notNull().unique(),
    vendorContactId: uuid("vendor_contact_id").references(() => contacts.id, {
      onDelete: "restrict",
    }),

    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    amountCurrency: text("amount_currency").notNull(),
    amountOriginalMinor: bigint("amount_original_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateAtCommit: numeric("fx_rate_at_commit", {
      precision: 20,
      scale: 8,
    }).notNull(),

    description: text("description").notNull(),
    committedDate: date("committed_date").notNull(),
    expectedCompletionDate: date("expected_completion_date"),
    /** 'open' | 'partially_paid' | 'completed' | 'cancelled' */
    status: text("status").notNull().default("open"),

    contractDocumentId: uuid("contract_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),

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
    index("dev_commitments_ledger_project_idx").on(t.projectId),
    index("dev_commitments_ledger_status_idx").on(t.status),
    index("dev_commitments_ledger_vendor_idx").on(t.vendorContactId),
  ],
);

export type DevCommitmentLedger = typeof devCommitmentsLedger.$inferSelect;
export type DevCommitmentLedgerInsert =
  typeof devCommitmentsLedger.$inferInsert;

// -----------------------------------------------------------------------------
// 12) dev_transactions — append-only actual money movements
// -----------------------------------------------------------------------------

export const devTransactions = pgTable(
  "dev_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    transactionCode: text("transaction_code").notNull().unique(),

    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => devBankAccounts.id, { onDelete: "restrict" }),
    /** 'inflow' | 'outflow' | 'internal_transfer' */
    direction: text("direction").notNull(),

    categoryId: uuid("category_id").references(() => devCostCategories.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "restrict",
    }),
    unitId: uuid("unit_id").references(() => villas.id, {
      onDelete: "restrict",
    }),
    relatedCommitmentId: uuid("related_commitment_id").references(
      () => devCommitmentsLedger.id,
      { onDelete: "restrict" },
    ),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    fxRateAtTransaction: numeric("fx_rate_at_transaction", {
      precision: 20,
      scale: 8,
    }).notNull(),

    counterpartyName: text("counterparty_name"),
    counterpartyContactId: uuid("counterparty_contact_id").references(
      () => contacts.id,
      { onDelete: "restrict" },
    ),

    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    externalReference: text("external_reference"),

    /** 'single_project' | 'multi_project' | 'company_overhead' */
    allocationType: text("allocation_type").notNull().default("single_project"),
    /** {"project_id_1": 0.6, "project_id_2": 0.4} for multi_project */
    allocationMetadata: jsonb("allocation_metadata"),

    relatedDrawdownId: uuid("related_drawdown_id").references(
      () => capitalDrawdowns.id,
      { onDelete: "restrict" },
    ),
    relatedDistributionId: uuid("related_distribution_id").references(
      () => distributions.id,
      { onDelete: "restrict" },
    ),

    receiptDocumentId: uuid("receipt_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),

    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: uuid("reconciled_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    bankStatementLineRef: text("bank_statement_line_ref"),

    notes: text("notes"),

    /**
     * Stage 4.A.2 — tax classification fields. Operator (or AI agent in
     * a later stage) classifies each transaction with its applicable
     * tax_type so period reports can be aggregated correctly.
     */
    taxTypeId: uuid("tax_type_id"),
    taxAmountMinor: bigint("tax_amount_minor", { mode: "bigint" }),
    isTaxIncluded: boolean("is_tax_included"),
    /**
     * 'unclassified' | 'classified' | 'reviewed' | 'flagged_missing_doc' | 'tax_exempt'
     */
    taxClassificationStatus: text("tax_classification_status")
      .notNull()
      .default("unclassified"),
    taxDocumentId: uuid("tax_document_id"),

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
    index("dev_transactions_account_idx").on(t.bankAccountId),
    index("dev_transactions_project_idx").on(t.projectId),
    index("dev_transactions_category_idx").on(t.categoryId),
    index("dev_transactions_date_idx").on(sql`${t.transactionDate} desc`),
    index("dev_transactions_drawdown_idx").on(t.relatedDrawdownId),
    index("dev_transactions_distribution_idx").on(t.relatedDistributionId),
    index("dev_transactions_tax_type_idx").on(t.taxTypeId),
    index("dev_transactions_tax_status_idx").on(t.taxClassificationStatus),
  ],
);

export type DevTransaction = typeof devTransactions.$inferSelect;
export type DevTransactionInsert = typeof devTransactions.$inferInsert;

// -----------------------------------------------------------------------------
// 13) dev_corporate_events
// -----------------------------------------------------------------------------

export const devCorporateEvents = pgTable(
  "dev_corporate_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventCode: text("event_code").notNull().unique(),
    /**
     * 'director_loan_in' | 'director_loan_repayment'
     * | 'shareholder_contribution' | 'dividend_declared' | 'dividend_paid'
     * | 'share_transfer' | 'other'
     */
    eventType: text("event_type").notNull(),

    relatedContactId: uuid("related_contact_id").references(() => contacts.id, {
      onDelete: "restrict",
    }),
    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    amountCurrency: text("amount_currency").notNull(),
    amountOriginalMinor: bigint("amount_original_minor", {
      mode: "bigint",
    }).notNull(),
    fxRate: numeric("fx_rate", { precision: 20, scale: 8 }).notNull(),

    eventDate: date("event_date").notNull(),
    description: text("description").notNull(),
    relatedTransactionId: uuid("related_transaction_id").references(
      () => devTransactions.id,
      { onDelete: "restrict" },
    ),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),

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
    index("dev_corporate_events_type_idx").on(t.eventType),
    index("dev_corporate_events_date_idx").on(sql`${t.eventDate} desc`),
  ],
);

export type DevCorporateEvent = typeof devCorporateEvents.$inferSelect;
export type DevCorporateEventInsert = typeof devCorporateEvents.$inferInsert;

// -----------------------------------------------------------------------------
// 14) dev_fx_snapshots
// -----------------------------------------------------------------------------

export const devFxSnapshots = pgTable(
  "dev_fx_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotDate: date("snapshot_date").notNull().unique(),
    baseCurrency: text("base_currency").notNull().default("USD"),

    rateIdr: numeric("rate_idr", { precision: 20, scale: 8 }).notNull(),
    rateRub: numeric("rate_rub", { precision: 20, scale: 8 }),
    rateEur: numeric("rate_eur", { precision: 20, scale: 8 }),
    rateUsdt: numeric("rate_usdt", { precision: 20, scale: 8 })
      .notNull()
      .default("1.0"),
    rateCny: numeric("rate_cny", { precision: 20, scale: 8 }),

    /** 'manual' | 'api' | 'wise' | 'xe' | 'custom' */
    source: text("source").notNull().default("manual"),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dev_fx_snapshots_date_idx").on(sql`${t.snapshotDate} desc`),
  ],
);

export type DevFxSnapshot = typeof devFxSnapshots.$inferSelect;
export type DevFxSnapshotInsert = typeof devFxSnapshots.$inferInsert;
