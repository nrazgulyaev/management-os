/**
 * Stage 6.P3.A — Banking schema.
 *
 * 4 tables (migration 0079):
 *   - bank_connections        per-bank-account configuration
 *   - bank_transactions       imported transactions, idempotent ingestion
 *   - statement_imports       uploaded statement files (CSV/OFX/PDF/MT940)
 *   - reconciliation_rules    operator-defined auto-match rules
 *
 * RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  boolean,
  numeric,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import {
  devBankAccounts,
  devCostCategories,
  devTransactions,
} from "./dev-finance";
import { invoices } from "./sales";
import { vendors } from "./site-operations";

// ---------------------------------------------------------------------------
// bank_connections
// ---------------------------------------------------------------------------
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** BankProviderName */
    provider: text("provider").notNull(),

    /** Optional internal `dev_bank_accounts` row this connection feeds. */
    internalBankAccountId: uuid("internal_bank_account_id").references(
      () => devBankAccounts.id,
      { onDelete: "set null" },
    ),

    externalAccountId: text("external_account_id").notNull(),
    accountName: text("account_name"),
    accountType: text("account_type"),
    currency: text("currency").notNull(),

    /** ConnectionStatus FSM */
    status: text("status").notNull().default("pending"),

    /** Encrypted credential blob (STAY_LINK_KMS_SECRET, P1.B helper). */
    credentials: jsonb("credentials"),

    autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(true),
    syncFrequencyMinutes: integer("sync_frequency_minutes")
      .notNull()
      .default(60),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    lastSyncError: text("last_sync_error"),

    preferredStatementFormat: text("preferred_statement_format"),

    connectedBy: uuid("connected_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("bank_connections_provider_account_unique").on(
      t.organizationId,
      t.provider,
      t.externalAccountId,
    ),
    index("bank_connections_org_idx").on(t.organizationId),
    index("bank_connections_provider_idx").on(t.provider),
  ],
);

// ---------------------------------------------------------------------------
// bank_transactions
// ---------------------------------------------------------------------------
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bankConnectionId: uuid("bank_connection_id")
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),

    externalTransactionId: text("external_transaction_id").notNull(),
    externalReference: text("external_reference"),

    transactionDate: date("transaction_date").notNull(),
    valueDate: date("value_date"),
    bookingDate: date("booking_date"),

    /** Positive = credit, negative = debit (provider parsers normalize). */
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    originalAmountMinor: bigint("original_amount_minor", { mode: "bigint" }),
    originalCurrency: text("original_currency"),
    fxRate: numeric("fx_rate", { precision: 20, scale: 10 }),

    description: text("description").notNull(),
    counterpartyName: text("counterparty_name"),
    counterpartyAccount: text("counterparty_account"),
    counterpartyIban: text("counterparty_iban"),
    counterpartySwift: text("counterparty_swift"),
    counterpartyCountry: text("counterparty_country"),

    autoCategory: text("auto_category"),
    categoryConfidence: numeric("category_confidence", { precision: 3, scale: 2 }),
    categoryId: uuid("category_id").references(() => devCostCategories.id, {
      onDelete: "set null",
    }),
    manuallyCategorized: boolean("manually_categorized")
      .notNull()
      .default(false),
    categorizedBy: uuid("categorized_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    categorizedAt: timestamp("categorized_at", { withTimezone: true }),

    matchedInvoiceId: uuid("matched_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    matchedTransactionId: uuid("matched_transaction_id").references(
      () => devTransactions.id,
      { onDelete: "set null" },
    ),
    /** MatchStatus FSM */
    matchStatus: text("match_status").notNull().default("unmatched"),
    matchConfidence: numeric("match_confidence", { precision: 3, scale: 2 }),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    matchedBy: uuid("matched_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),

    /** ImportSource FSM */
    importSource: text("import_source").notNull(),
    importJobId: uuid("import_job_id"),
    rawPayload: jsonb("raw_payload"),

    isPending: boolean("is_pending").notNull().default(false),
    isDisputed: boolean("is_disputed").notNull().default(false),
    isReversed: boolean("is_reversed").notNull().default(false),
    /** Self-reference: reversal_of_id → original transaction. */
    reversalOfId: uuid("reversal_of_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("bank_transactions_external_unique").on(
      t.bankConnectionId,
      t.externalTransactionId,
    ),
    index("bank_transactions_connection_idx").on(t.bankConnectionId),
    index("bank_transactions_date_idx").on(t.transactionDate),
    index("bank_transactions_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// statement_imports
// ---------------------------------------------------------------------------
export const statementImports = pgTable(
  "statement_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bankConnectionId: uuid("bank_connection_id")
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),

    importCode: text("import_code").notNull().unique(),

    /** StatementFormat FSM */
    format: text("format").notNull(),
    filename: text("filename"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "bigint" }),
    sourceDocumentId: uuid("source_document_id"),
    sourceContentEncrypted: text("source_content_encrypted"),

    statementPeriodStart: date("statement_period_start"),
    statementPeriodEnd: date("statement_period_end"),

    totalRows: integer("total_rows"),
    transactionsCreated: integer("transactions_created").notNull().default(0),
    transactionsSkippedDuplicate: integer("transactions_skipped_duplicate")
      .notNull()
      .default(0),
    rowsFailed: integer("rows_failed").notNull().default(0),

    /** ImportStatus FSM */
    status: text("status").notNull().default("pending"),
    errorLog: jsonb("error_log"),

    /** CSV column mapping: { date: "Date", amount: "Amount", ... } */
    columnMapping: jsonb("column_mapping"),

    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => appUsers.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("statement_imports_connection_idx").on(t.bankConnectionId),
    index("statement_imports_status_idx").on(t.status),
    index("statement_imports_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// reconciliation_rules
// ---------------------------------------------------------------------------
export const reconciliationRules = pgTable(
  "reconciliation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),

    /** MatchType FSM */
    matchType: text("match_type").notNull(),
    matchConfig: jsonb("match_config").notNull(),

    autoAssignCategoryId: uuid("auto_assign_category_id").references(
      () => devCostCategories.id,
      { onDelete: "set null" },
    ),
    autoMatchToVendorId: uuid("auto_match_to_vendor_id").references(
      () => vendors.id,
      { onDelete: "set null" },
    ),
    /** InvoiceMatchStrategy FSM */
    autoMatchToInvoiceStrategy: text("auto_match_to_invoice_strategy"),

    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    matchCount: integer("match_count").notNull().default(0),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reconciliation_rules_org_idx").on(t.organizationId),
    index("reconciliation_rules_active_idx").on(t.isActive, t.priority),
  ],
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type BankConnection = typeof bankConnections.$inferSelect;
export type NewBankConnection = typeof bankConnections.$inferInsert;
export type BankTransactionRow = typeof bankTransactions.$inferSelect;
export type NewBankTransactionRow = typeof bankTransactions.$inferInsert;
export type StatementImport = typeof statementImports.$inferSelect;
export type NewStatementImport = typeof statementImports.$inferInsert;
export type ReconciliationRule = typeof reconciliationRules.$inferSelect;
export type NewReconciliationRule = typeof reconciliationRules.$inferInsert;

// ---------------------------------------------------------------------------
// String-union types — mirror SQL CHECK constraints. Updates require
// editing both files.
// ---------------------------------------------------------------------------

export type BankProviderName =
  | "revolut"
  | "wise"
  | "mandiri"
  | "bca"
  | "plaid"
  | "manual"
  | "other";

export const BANK_PROVIDERS: readonly BankProviderName[] = [
  "revolut",
  "wise",
  "mandiri",
  "bca",
  "plaid",
  "manual",
  "other",
] as const;

export type BankAccountType =
  | "checking"
  | "savings"
  | "business"
  | "multi_currency"
  | "crypto";

export type BankConnectionStatus =
  | "pending"
  | "connecting"
  | "active"
  | "paused"
  | "error"
  | "archived";

export type StatementFormat = "csv" | "ofx" | "pdf" | "mt940" | "json";

export const STATEMENT_FORMATS: readonly StatementFormat[] = [
  "csv",
  "ofx",
  "pdf",
  "mt940",
  "json",
] as const;

export type ImportStatus =
  | "pending"
  | "parsing"
  | "preview_ready"
  | "importing"
  | "completed"
  | "failed"
  | "cancelled";

export type ImportSource =
  | "api"
  | "csv_upload"
  | "ofx_upload"
  | "pdf_upload"
  | "email_parsed"
  | "manual_entry";

export type MatchStatus =
  | "unmatched"
  | "auto_matched"
  | "manually_matched"
  | "partial_match"
  | "mismatch_flagged"
  | "ignored";

export type ReconciliationMatchType =
  | "description_contains"
  | "description_regex"
  | "counterparty_match"
  | "amount_range"
  | "amount_exact"
  | "date_range_match";

export type InvoiceMatchStrategy =
  | "amount_only"
  | "amount_and_date"
  | "amount_date_vendor"
  | "fuzzy_description";

// Suppress lint on imports referenced only in FK closures.
void sql;
