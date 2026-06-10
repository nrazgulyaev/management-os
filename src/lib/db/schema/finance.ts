import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  numeric,
  date,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { owners, ownershipShares } from "./ownership";
import { bookings } from "./bookings";
import { documents } from "./documents";
import { payoutMethods } from "./ownership";
import { organizations } from "./saas";
import { ownerThreads } from "./owner-threads";

/**
 * Finance domain — investor-grade ledger.
 *
 * Money rule (binding): every monetary column is BIGINT minor units of `currency`.
 * USD 123.45 → 12345. IDR 100,000 → 10000000 (IDR has 2 decimal scale conventionally).
 * Floating point is forbidden for amounts at rest. Display-time conversion is
 * the renderer's job, not the storage's.
 *
 * Period locking is enforced via `fn_prevent_locked_period_mutation()` in the
 * migration. Application code must still call `assertPeriodOpen()` so the UI
 * can refuse before round-tripping to the DB, but the DB is the hard line.
 */

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 9 }).notNull(),
    rateDate: date("rate_date").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fx_rates_unique").on(t.baseCurrency, t.quoteCurrency, t.rateDate),
    index("fx_rates_date_idx").on(t.rateDate),
  ],
);

export const revenueLines = pgTable(
  "revenue_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    revenueType: text("revenue_type").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    serviceDate: date("service_date"),
    earnedAt: timestamp("earned_at", { withTimezone: true }),
    source: text("source").notNull().default("manual"),
    sourceReference: text("source_reference"),
    visibility: text("visibility").notNull().default("internal"),
    status: text("status").notNull().default("posted"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("revenue_lines_villa_date_idx").on(t.villaId, t.serviceDate),
    index("revenue_lines_project_date_idx").on(t.projectId, t.serviceDate),
    index("revenue_lines_booking_idx").on(t.bookingId),
    index("revenue_lines_status_idx").on(t.status),
  ],
);

export const feeLines = pgTable(
  "fee_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    feeType: text("fee_type").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    feeDate: date("fee_date"),
    source: text("source").notNull().default("manual"),
    sourceReference: text("source_reference"),
    status: text("status").notNull().default("posted"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fee_lines_villa_date_idx").on(t.villaId, t.feeDate),
    index("fee_lines_project_date_idx").on(t.projectId, t.feeDate),
    index("fee_lines_booking_idx").on(t.bookingId),
  ],
);

export const expenseLines = pgTable(
  "expense_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    expenseType: text("expense_type").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    expenseDate: date("expense_date").notNull(),
    allocationScope: text("allocation_scope").notNull().default("villa"),
    capitalized: boolean("capitalized").notNull().default(false),
    ownerChargeable: boolean("owner_chargeable").notNull().default(true),
    requiresOwnerApproval: boolean("requires_owner_approval").notNull().default(false),
    approvalStatus: text("approval_status").notNull().default("not_required"),
    receiptDocumentId: uuid("receipt_document_id").references(() => documents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("posted"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expense_lines_villa_date_idx").on(t.villaId, t.expenseDate),
    index("expense_lines_project_date_idx").on(t.projectId, t.expenseDate),
    index("expense_lines_scope_idx").on(t.allocationScope),
  ],
);

export const allocationRules = pgTable(
  "allocation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    ruleName: text("rule_name").notNull(),
    allocationModel: text("allocation_model").notNull(),
    appliesTo: text("applies_to").notNull(),
    basis: text("basis").notNull(),
    config: jsonb("config"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("allocation_rules_project_idx").on(t.projectId)],
);

export const expenseAllocations = pgTable(
  "expense_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseLineId: uuid("expense_line_id")
      .notNull()
      .references(() => expenseLines.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    ownershipShareId: uuid("ownership_share_id").references(() => ownershipShares.id, {
      onDelete: "set null",
    }),
    allocationRuleId: uuid("allocation_rule_id").references(() => allocationRules.id, {
      onDelete: "set null",
    }),
    allocatedAmountMinor: bigint("allocated_amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    allocationBasis: text("allocation_basis").notNull(),
    allocationPercent: numeric("allocation_percent", { precision: 9, scale: 6 }),
    /** Materialised owner_statements row this allocation belongs to. */
    statementId: uuid("statement_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expense_allocations_expense_idx").on(t.expenseLineId),
    index("expense_allocations_owner_idx").on(t.ownerId),
    index("expense_allocations_statement_idx").on(t.statementId),
  ],
);

export const taxLines = pgTable(
  "tax_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    taxType: text("tax_type").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    taxDate: date("tax_date").notNull(),
    status: text("status").notNull().default("posted"),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tax_lines_villa_date_idx").on(t.villaId, t.taxDate),
    index("tax_lines_project_date_idx").on(t.projectId, t.taxDate),
  ],
);

export const reserveMovements = pgTable(
  "reserve_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    reserveType: text("reserve_type").notNull(),
    movementType: text("movement_type").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    movementDate: date("movement_date").notNull(),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    status: text("status").notNull().default("posted"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reserve_movements_villa_idx").on(t.villaId, t.movementDate),
    index("reserve_movements_project_idx").on(t.projectId, t.movementDate),
    index("reserve_movements_type_idx").on(t.reserveType),
  ],
);

export const managementFeeRules = pgTable(
  "management_fee_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    ruleName: text("rule_name").notNull(),
    feeModel: text("fee_model").notNull(),
    feePercent: numeric("fee_percent", { precision: 6, scale: 3 }),
    fixedAmountMinor: bigint("fixed_amount_minor", { mode: "bigint" }),
    currency: text("currency"),
    config: jsonb("config"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("management_fee_rules_project_idx").on(t.projectId),
    index("management_fee_rules_villa_idx").on(t.villaId),
  ],
);

export const managementFeeLines = pgTable(
  "management_fee_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    statementId: uuid("statement_id"),
    ruleId: uuid("rule_id").references(() => managementFeeRules.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    feeDate: date("fee_date").notNull(),
    status: text("status").notNull().default("posted"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("management_fee_lines_villa_idx").on(t.villaId, t.feeDate),
    index("management_fee_lines_owner_idx").on(t.ownerId),
  ],
);

export const statementPeriods = pgTable(
  "statement_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("open"),
    closedBy: uuid("closed_by").references(() => appUsers.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("statement_periods_range_unique").on(t.periodStart, t.periodEnd),
    index("statement_periods_status_idx").on(t.status),
  ],
);

export const ownerStatements = pgTable(
  "owner_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => statementPeriods.id, { onDelete: "restrict" }),
    statementCode: text("statement_code").notNull().unique(),
    managementModel: text("management_model").notNull(),
    currency: text("currency").notNull(),
    grossRevenueMinor: bigint("gross_revenue_minor", { mode: "bigint" }).notNull().default(0n),
    totalFeesMinor: bigint("total_fees_minor", { mode: "bigint" }).notNull().default(0n),
    totalExpensesMinor: bigint("total_expenses_minor", { mode: "bigint" }).notNull().default(0n),
    totalTaxesMinor: bigint("total_taxes_minor", { mode: "bigint" }).notNull().default(0n),
    totalReservesMinor: bigint("total_reserves_minor", { mode: "bigint" }).notNull().default(0n),
    managementFeeMinor: bigint("management_fee_minor", { mode: "bigint" }).notNull().default(0n),
    netPayoutMinor: bigint("net_payout_minor", { mode: "bigint" }).notNull().default(0n),
    occupancyRate: numeric("occupancy_rate", { precision: 6, scale: 3 }),
    adrMinor: bigint("adr_minor", { mode: "bigint" }),
    revparMinor: bigint("revpar_minor", { mode: "bigint" }),
    annualizedYield: numeric("annualized_yield", { precision: 8, scale: 4 }),
    status: text("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    // STATEMENT-1: added by migration 0104. Org tenancy + period
    // anchor + integrity hash + delivery telemetry.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    periodMonth: date("period_month"),
    operatorCommissionPct: numeric("operator_commission_pct", {
      precision: 6,
      scale: 4,
    }),
    fxRateSnapshot: numeric("fx_rate_snapshot", { precision: 15, scale: 4 }),
    netToOwnerUsdMinor: bigint("net_to_owner_usd_minor", { mode: "bigint" }),
    contentHash: text("content_hash"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentToEmail: text("sent_to_email"),
    pdfUrl: text("pdf_url"),
    disputeNotes: text("dispute_notes"),
    // Phase 2 data-wiring PR 1 — owner-side state machine, independent
    // of mgmt-side `status`. The auto-ack scheduler reads
    // (owner_state, auto_ack_at) to flip pending → auto_acknowledged
    // after the TTL.
    /** Enum: pending | viewed | acknowledged | disputed | auto_acknowledged | superseded. */
    ownerState: text("owner_state").notNull().default("pending"),
    ownerViewedAt: timestamp("owner_viewed_at", { withTimezone: true }),
    ownerAckedAt: timestamp("owner_acked_at", { withTimezone: true }),
    ownerDisputedAt: timestamp("owner_disputed_at", { withTimezone: true }),
    /** Populated when statement becomes "ready for owner" so the auto-ack scheduler knows when to fire. */
    autoAckAt: timestamp("auto_ack_at", { withTimezone: true }),
    /** Enum (set by raiseStatementDisputeAction): line_amount | line_missing | fees_too_high | other. */
    disputeReasonKind: text("dispute_reason_kind"),
    // Phase 2 PR 3 — FK to ownerThreads.id wired now that the
    // table exists. Migration 0114 adds the constraint at the DB level.
    disputeThreadId: uuid("dispute_thread_id").references(() => ownerThreads.id, {
      onDelete: "set null",
    }),
    /**
     * FC-OWNER-STATEMENTS §4.4 — resolve→reissue link. The OLD row points
     * forward to the revised statement that replaced it; set together with
     * owner_state='superseded'. Migration 0117. Self-FK needs the AnyPgColumn
     * return annotation to break Drizzle's circular type inference.
     */
    supersededById: uuid("superseded_by_id").references(
      (): AnyPgColumn => ownerStatements.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("owner_statements_owner_period_idx").on(t.ownerId, t.periodId),
    index("owner_statements_period_idx").on(t.periodId),
    index("owner_statements_status_idx").on(t.status),
    index("owner_statements_org_idx").on(t.organizationId),
    index("owner_statements_period_month_idx").on(t.periodMonth),
    index("owner_statements_owner_state_auto_ack_idx").on(t.ownerState, t.autoAckAt),
    index("owner_statements_superseded_by_idx").on(t.supersededById),
  ],
);

export const statementLines = pgTable(
  "statement_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => ownerStatements.id, { onDelete: "cascade" }),
    lineType: text("line_type").notNull(),
    sourceTable: text("source_table"),
    sourceId: uuid("source_id"),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("statement_lines_statement_idx").on(t.statementId, t.sortOrder),
    index("statement_lines_type_idx").on(t.lineType),
  ],
);

export const financeAdjustments = pgTable(
  "finance_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    statementId: uuid("statement_id").references(() => ownerStatements.id, {
      onDelete: "set null",
    }),
    adjustmentType: text("adjustment_type").notNull(),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    adjustmentDate: date("adjustment_date").notNull(),
    status: text("status").notNull().default("posted"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finance_adjustments_statement_idx").on(t.statementId)],
);

export const payoutBatches = pgTable(
  "payout_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchCode: text("batch_code").notNull().unique(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => appUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    // WRITE-FLOW-AUDIT (migration 0160): tenancy scope for payout writes.
    // Backfilled to the linked statement's org or ARCONIQUE_DEFAULT; every
    // insert site stamps it from requireOrgId(). NOT NULL enforced by the
    // guarded migration 0163.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payout_batches_status_idx").on(t.status),
    index("payout_batches_org_idx").on(t.organizationId),
  ],
);

export const payoutLines = pgTable(
  "payout_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutBatchId: uuid("payout_batch_id").references(() => payoutBatches.id, {
      onDelete: "set null",
    }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    payoutMethodId: uuid("payout_method_id").references(() => payoutMethods.id, {
      onDelete: "set null",
    }),
    statementId: uuid("statement_id").references(() => ownerStatements.id, {
      onDelete: "set null",
    }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("pending"),
    reference: text("reference"),
    scheduledFor: date("scheduled_for"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // WRITE-FLOW-AUDIT (migration 0160): tenancy scope for payout-line
    // reads/writes. Backfilled via owner_statements.organization_id (or the
    // batch / ARCONIQUE_DEFAULT); createPayoutLineAction stamps it from
    // requireOrgId(). NOT NULL enforced by the guarded migration 0163.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payout_lines_owner_idx").on(t.ownerId),
    index("payout_lines_batch_idx").on(t.payoutBatchId),
    index("payout_lines_status_idx").on(t.status),
    index("payout_lines_org_idx").on(t.organizationId),
  ],
);

// Convenience types
export type FxRate = typeof fxRates.$inferSelect;
export type RevenueLine = typeof revenueLines.$inferSelect;
export type NewRevenueLine = typeof revenueLines.$inferInsert;
export type FeeLine = typeof feeLines.$inferSelect;
export type NewFeeLine = typeof feeLines.$inferInsert;
export type ExpenseLine = typeof expenseLines.$inferSelect;
export type NewExpenseLine = typeof expenseLines.$inferInsert;
export type AllocationRule = typeof allocationRules.$inferSelect;
export type ExpenseAllocation = typeof expenseAllocations.$inferSelect;
export type TaxLine = typeof taxLines.$inferSelect;
export type NewTaxLine = typeof taxLines.$inferInsert;
export type ReserveMovement = typeof reserveMovements.$inferSelect;
export type NewReserveMovement = typeof reserveMovements.$inferInsert;
export type ManagementFeeRule = typeof managementFeeRules.$inferSelect;
export type ManagementFeeLine = typeof managementFeeLines.$inferSelect;
export type StatementPeriod = typeof statementPeriods.$inferSelect;
export type OwnerStatement = typeof ownerStatements.$inferSelect;
export type NewOwnerStatement = typeof ownerStatements.$inferInsert;
export type StatementLine = typeof statementLines.$inferSelect;
export type NewStatementLine = typeof statementLines.$inferInsert;
export type FinanceAdjustment = typeof financeAdjustments.$inferSelect;
export type PayoutBatch = typeof payoutBatches.$inferSelect;
export type PayoutLine = typeof payoutLines.$inferSelect;
