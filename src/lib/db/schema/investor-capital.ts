import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { contacts } from "./contacts";
import { documents } from "./documents";
import { organizations } from "./saas";

/**
 * Development OS — Stage 2.3 schema (investor capital cluster).
 *
 * Money is BIGINT minor units. USD is canonical for cross-investor
 * reporting; per-transaction `_usd_minor` columns are paired with an
 * `fx_rate_at_*` snapshot so historical reports are reproducible.
 *
 * All FKs are `onDelete: "restrict"` to preserve audit trail. The one
 * exception is `distribution_allocations.distribution_id` which uses
 * cascade so deleting a draft (cancelled-then-purged) distribution
 * cleans up its allocation rows.
 *
 * See docs/development-os-architecture.md §"Stage 2.3" for the full
 * schema contract and the architectural decisions.
 */

// -----------------------------------------------------------------------------
// 1) investors
// -----------------------------------------------------------------------------

export const investors = pgTable(
  "investors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "restrict",
    }),
    investorCode: text("investor_code").notNull().unique(),
    /** 'gp' | 'lp_private' | 'lp_institutional' | 'landowner_jv' */
    investorType: text("investor_type").notNull(),
    legalName: text("legal_name").notNull(),
    /** 'individual' | 'llc' | 'pt_pma' | 'offshore' | 'trust' */
    legalEntityType: text("legal_entity_type"),
    /** ISO country code */
    taxResidency: text("tax_residency"),
    /** 'USD' | 'IDR' | 'RUB' | 'EUR' | 'USDT' | 'CNY' */
    primaryCurrency: text("primary_currency").notNull().default("USD"),
    /** 'en' | 'ru' | 'id' | 'zh' */
    reportingLanguage: text("reporting_language").notNull().default("en"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    /** Stage 3.D — WhatsApp routing. */
    whatsappPhone: text("whatsapp_phone"),
    prefersWhatsapp: boolean("prefers_whatsapp").notNull().default(false),
    notes: text("notes"),
    /** 'active' | 'inactive' | 'exited' */
    status: text("status").notNull().default("active"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    exitedAt: timestamp("exited_at", { withTimezone: true }),
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
    index("investors_status_idx").on(t.status),
    index("investors_type_idx").on(t.investorType),
    index("investors_contact_idx").on(t.contactId),
  ],
);

export type Investor = typeof investors.$inferSelect;
export type InvestorInsert = typeof investors.$inferInsert;

// -----------------------------------------------------------------------------
// 2) capital_commitments
// -----------------------------------------------------------------------------

export const capitalCommitments = pgTable(
  "capital_commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072. Declared
    // nullable in TS to avoid breaking out-of-scope insert callsites
    // (e.g. commitment-actions.ts) not yet migrated to pass it.
    organizationId: uuid("organization_id").references(() => organizations.id),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "restrict" }),
    /** NULL for multi-project / company-level commitments */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "restrict",
    }),
    commitmentCode: text("commitment_code").notNull().unique(),

    committedAmountMinor: bigint("committed_amount_minor", {
      mode: "bigint",
    }).notNull(),
    committedCurrency: text("committed_currency").notNull(),
    committedAmountUsdMinor: bigint("committed_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateAtCommitment: numeric("fx_rate_at_commitment", {
      precision: 20,
      scale: 8,
    }).notNull(),

    /** 0.0000 to 100.0000 — the negotiated profit slice for this commitment */
    profitSharePercent: numeric("profit_share_percent", {
      precision: 7,
      scale: 4,
    }).notNull(),
    /** Lower numbers returned first; ties allowed (pro-rata within tier) */
    capitalReturnPriority: integer("capital_return_priority")
      .notNull()
      .default(1),

    isLandownerJv: boolean("is_landowner_jv").notNull().default(false),
    landownerAssetValueMinor: bigint("landowner_asset_value_minor", {
      mode: "bigint",
    }),
    landownerAssetCurrency: text("landowner_asset_currency"),

    /** 'active' | 'fully_called' | 'closed' | 'cancelled' */
    status: text("status").notNull().default("active"),
    signedAt: date("signed_at"),
    agreementDocumentId: uuid("agreement_document_id").references(
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
    index("capital_commitments_investor_idx").on(t.investorId),
    index("capital_commitments_project_idx").on(t.projectId),
    index("capital_commitments_status_idx").on(t.status),
  ],
);

export type CapitalCommitment = typeof capitalCommitments.$inferSelect;
export type CapitalCommitmentInsert = typeof capitalCommitments.$inferInsert;

// -----------------------------------------------------------------------------
// 3) capital_drawdowns
// -----------------------------------------------------------------------------

export const capitalDrawdowns = pgTable(
  "capital_drawdowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072. Declared
    // nullable in TS to avoid breaking out-of-scope insert callsites
    // (e.g. drawdown-actions.ts) not yet migrated to pass it.
    organizationId: uuid("organization_id").references(() => organizations.id),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => capitalCommitments.id, { onDelete: "restrict" }),
    /** Sequential per commitment: 1, 2, 3, ... */
    drawdownNumber: integer("drawdown_number").notNull(),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    fxRateAtDrawdown: numeric("fx_rate_at_drawdown", {
      precision: 20,
      scale: 8,
    }).notNull(),

    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueDate: date("due_date").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    /** 'requested' | 'received' | 'overdue' | 'cancelled' */
    status: text("status").notNull().default("requested"),

    /**
     * 'minimum_balance_threshold' | 'milestone_call' | 'manual'
     * | 'initial_capitalization'
     */
    triggerReason: text("trigger_reason").notNull(),
    triggerBalanceAtRequestUsdMinor: bigint(
      "trigger_balance_at_request_usd_minor",
      { mode: "bigint" },
    ),

    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    receiptDocumentId: uuid("receipt_document_id").references(
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
    unique("capital_drawdowns_commitment_number_key").on(
      t.commitmentId,
      t.drawdownNumber,
    ),
    index("capital_drawdowns_commitment_idx").on(t.commitmentId),
    index("capital_drawdowns_status_idx").on(t.status),
  ],
);

export type CapitalDrawdown = typeof capitalDrawdowns.$inferSelect;
export type CapitalDrawdownInsert = typeof capitalDrawdowns.$inferInsert;

// -----------------------------------------------------------------------------
// 4) investor_wallets
// -----------------------------------------------------------------------------

export const investorWallets = pgTable(
  "investor_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    commitmentId: uuid("commitment_id")
      .notNull()
      .unique()
      .references(() => capitalCommitments.id, { onDelete: "restrict" }),

    availableBalanceUsdMinor: bigint("available_balance_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    holdBalanceUsdMinor: bigint("hold_balance_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    reinvestPendingUsdMinor: bigint("reinvest_pending_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),

    totalDrawnUsdMinor: bigint("total_drawn_usd_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    totalReturnedCapitalUsdMinor: bigint("total_returned_capital_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    totalProfitDistributedUsdMinor: bigint(
      "total_profit_distributed_usd_minor",
      { mode: "bigint" },
    )
      .notNull()
      .default(0n),
    totalWithdrawnUsdMinor: bigint("total_withdrawn_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    totalReinvestedUsdMinor: bigint("total_reinvested_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),

    /** Stage 4.B.2 — separated balance buckets. */
    cashBalanceMinor: bigint("cash_balance_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    economicBalanceMinor: bigint("economic_balance_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    reinvestmentBalanceMinor: bigint("reinvestment_balance_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    committedBalanceMinor: bigint("committed_balance_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    pendingDistributionMinor: bigint("pending_distribution_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    residualInventoryValueMinor: bigint("residual_inventory_value_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    lastRecomputedAt: timestamp("last_recomputed_at", { withTimezone: true }),

    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("investor_wallets_commitment_idx").on(t.commitmentId)],
);

export type InvestorWallet = typeof investorWallets.$inferSelect;
export type InvestorWalletInsert = typeof investorWallets.$inferInsert;

// -----------------------------------------------------------------------------
// 6) distributions (declared before wallet_transactions because wallet_tx
//    has a deferred FK to distributions.id; types-wise we declare the table
//    here to satisfy `references(() => distributions.id)` in wallet_transactions)
// -----------------------------------------------------------------------------

export const distributions = pgTable(
  "distributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL for company-level distribution */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "restrict",
    }),
    /** Sequential per project: 1, 2, ... */
    distributionNumber: integer("distribution_number").notNull(),

    /** 'capital_return' | 'profit_distribution' | 'mixed' */
    distributionType: text("distribution_type").notNull(),
    totalAmountUsdMinor: bigint("total_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),

    /**
     * 'self_sustaining_threshold' | 'project_exit' | 'final_distribution'
     * | 'manual'
     */
    triggerReason: text("trigger_reason").notNull(),
    triggerCompanyBalanceUsdMinor: bigint(
      "trigger_company_balance_usd_minor",
      { mode: "bigint" },
    ),

    declaredAt: timestamp("declared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveDate: date("effective_date").notNull(),
    /** 'declared' | 'executing' | 'completed' | 'cancelled' */
    status: text("status").notNull().default("declared"),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    notes: text("notes"),
    declaredBy: uuid("declared_by").references(() => appUsers.id, {
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
    unique("distributions_project_number_key").on(
      t.projectId,
      t.distributionNumber,
    ),
    index("distributions_project_idx").on(t.projectId),
    index("distributions_status_idx").on(t.status),
  ],
);

export type Distribution = typeof distributions.$inferSelect;
export type DistributionInsert = typeof distributions.$inferInsert;

// -----------------------------------------------------------------------------
// 5) wallet_transactions — append-only ledger
// -----------------------------------------------------------------------------

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => investorWallets.id, { onDelete: "restrict" }),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => capitalCommitments.id, { onDelete: "restrict" }),

    /**
     * 'drawdown_received' | 'capital_return' | 'profit_distribution'
     * | 'wallet_withdrawal' | 'wallet_reinvest_out' | 'wallet_reinvest_in'
     * | 'wallet_hold_set' | 'wallet_hold_release' | 'wallet_take_asset'
     * | 'adjustment'
     */
    transactionType: text("transaction_type").notNull(),

    /** Always USD; signed (positive = inflow, negative = outflow) */
    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    amountOriginalMinor: bigint("amount_original_minor", { mode: "bigint" }),
    originalCurrency: text("original_currency"),
    fxRateAtTransaction: numeric("fx_rate_at_transaction", {
      precision: 20,
      scale: 8,
    }),

    balanceAvailableAfterUsdMinor: bigint(
      "balance_available_after_usd_minor",
      { mode: "bigint" },
    ).notNull(),
    balanceHoldAfterUsdMinor: bigint("balance_hold_after_usd_minor", {
      mode: "bigint",
    }).notNull(),

    drawdownId: uuid("drawdown_id").references(() => capitalDrawdowns.id, {
      onDelete: "restrict",
    }),
    distributionId: uuid("distribution_id").references(() => distributions.id, {
      onDelete: "restrict",
    }),
    assetTakenVillaId: uuid("asset_taken_villa_id").references(() => villas.id, {
      onDelete: "restrict",
    }),
    reinvestTargetCommitmentId: uuid("reinvest_target_commitment_id").references(
      () => capitalCommitments.id,
      { onDelete: "restrict" },
    ),

    description: text("description"),
    externalReference: text("external_reference"),

    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("wallet_transactions_wallet_idx").on(t.walletId),
    index("wallet_transactions_commitment_idx").on(t.commitmentId),
    index("wallet_transactions_type_idx").on(t.transactionType),
    index("wallet_transactions_occurred_idx").on(
      sql`${t.occurredAt} desc`,
    ),
    index("wallet_transactions_drawdown_idx").on(t.drawdownId),
    index("wallet_transactions_distribution_idx").on(t.distributionId),
  ],
);

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type WalletTransactionInsert = typeof walletTransactions.$inferInsert;

// -----------------------------------------------------------------------------
// 7) distribution_allocations
// -----------------------------------------------------------------------------

export const distributionAllocations = pgTable(
  "distribution_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    distributionId: uuid("distribution_id")
      .notNull()
      .references(() => distributions.id, { onDelete: "cascade" }),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => capitalCommitments.id, { onDelete: "restrict" }),

    capitalReturnAmountUsdMinor: bigint("capital_return_amount_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    profitAmountUsdMinor: bigint("profit_amount_usd_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    /** Must equal capital_return_amount + profit_amount (CHECK constraint) */
    totalAmountUsdMinor: bigint("total_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),

    /** Outstanding principal at distribution declare time, for audit */
    outstandingCapitalAtDeclareUsdMinor: bigint(
      "outstanding_capital_at_declare_usd_minor",
      { mode: "bigint" },
    ).notNull(),
    profitSharePercentUsed: numeric("profit_share_percent_used", {
      precision: 7,
      scale: 4,
    }).notNull(),

    /** 'pending' | 'executed' | 'cancelled' */
    status: text("status").notNull().default("pending"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    walletTransactionId: uuid("wallet_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "restrict" },
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
    index("distribution_allocations_distribution_idx").on(t.distributionId),
    index("distribution_allocations_commitment_idx").on(t.commitmentId),
  ],
);

export type DistributionAllocation =
  typeof distributionAllocations.$inferSelect;
export type DistributionAllocationInsert =
  typeof distributionAllocations.$inferInsert;
