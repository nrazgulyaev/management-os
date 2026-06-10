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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { contacts, contactRoles } from "./contacts";
import { documents } from "./documents";
import { organizations } from "./saas";

/**
 * Development OS — Stage 2.2.B schema (sales lifecycle).
 *
 * Money is BIGINT minor of an explicit currency, in BOTH USD and IDR with
 * an FX-rate snapshot at the moment of action. See
 * docs/development-os-architecture.md for the full schema contract.
 *
 * Cross-table FKs that would create import cycles (notably
 * `contractGroups.discountAppliedId` → `unitDiscounts.id`) are declared as
 * plain uuid here; the FK constraint is enforced at the SQL level by the
 * 0036 migration.
 */

// -----------------------------------------------------------------------------
// Pricing
// -----------------------------------------------------------------------------

export const pricingRules = pgTable("pricing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** 'time_based' | 'progress_based' | 'manual' */
  ruleType: text("rule_type").notNull().default("manual"),
  basePriceUsdMinor: bigint("base_price_usd_minor", { mode: "bigint" }).notNull(),
  escalationPercent: numeric("escalation_percent", { precision: 8, scale: 4 })
    .notNull()
    .default("0"),
  /** 'monthly' | 'per_5_progress_pct' | 'per_10_progress_pct' | 'per_milestone' */
  escalationFrequency: text("escalation_frequency"),
  /** 'sales_start' | 'construction_start' | 'fixed_date' */
  escalationStartTrigger: text("escalation_start_trigger")
    .notNull()
    .default("sales_start"),
  escalationStartValue: date("escalation_start_value"),
  ceilingPriceUsdMinor: bigint("ceiling_price_usd_minor", { mode: "bigint" }),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const unitPriceSnapshots = pgTable(
  "unit_price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    snapshotDate: timestamp("snapshot_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    priceUsdMinor: bigint("price_usd_minor", { mode: "bigint" }).notNull(),
    priceIdrMinor: bigint("price_idr_minor", { mode: "bigint" }).notNull(),
    fxRateUsdToIdr: numeric("fx_rate_usd_to_idr", {
      precision: 18,
      scale: 9,
    }).notNull(),
    /** 'rule_calculated' | 'manual_override' | 'contract_locked' | 'discount_applied' */
    priceBasis: text("price_basis").notNull(),
    /** 'progress_change' | 'time_elapsed' | 'manual' | 'contract_signed' | 'discount_authorized' */
    triggeredBy: text("triggered_by").notNull(),
    triggeredById: uuid("triggered_by_id"),
    changeAmountUsdMinor: bigint("change_amount_usd_minor", { mode: "bigint" }),
    changePercent: numeric("change_percent", { precision: 8, scale: 4 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("unit_price_snapshots_villa_date_idx").on(
      t.villaId,
      sql`${t.snapshotDate} desc`,
    ),
  ],
);

// -----------------------------------------------------------------------------
// Reservations
// -----------------------------------------------------------------------------

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    contactRoleId: uuid("contact_role_id").references(() => contactRoles.id, {
      onDelete: "set null",
    }),
    reservationFeeUsdMinor: bigint("reservation_fee_usd_minor", {
      mode: "bigint",
    }).notNull(),
    reservationFeeIdrMinor: bigint("reservation_fee_idr_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateAtReservation: numeric("fx_rate_at_reservation", {
      precision: 18,
      scale: 9,
    }).notNull(),
    /** 'bank_transfer' | 'crypto_usdt' | 'crypto_other' | 'cash' | 'card' */
    paymentMethod: text("payment_method").notNull(),
    paymentReference: text("payment_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** 'pending_payment' | 'active' | 'expired' | 'converted_to_contract' | 'cancelled' | 'refunded' */
    status: text("status").notNull().default("pending_payment"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    priceLockedUsdMinor: bigint("price_locked_usd_minor", {
      mode: "bigint",
    }).notNull(),
    priceLockedSnapshotId: uuid("price_locked_snapshot_id").references(
      () => unitPriceSnapshots.id,
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
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    refundedAmountUsdMinor: bigint("refunded_amount_usd_minor", {
      mode: "bigint",
    }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (t) => [
    index("reservations_villa_status_idx").on(t.villaId, t.status),
    index("reservations_contact_idx").on(t.contactId),
    index("reservations_project_status_idx").on(t.projectId, t.status),
    uniqueIndex("reservations_villa_active_unique")
      .on(t.villaId)
      .where(sql`status IN ('pending_payment', 'active')`),
  ],
);

// -----------------------------------------------------------------------------
// Contract templates + components
// -----------------------------------------------------------------------------

export const contractTemplates = pgTable("contract_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  /** 'off_plan' | 'completed_villa' | 'both' */
  applicableTo: text("applicable_to").notNull().default("both"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contractTemplateComponents = pgTable(
  "contract_template_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => contractTemplates.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    /** 'leasehold_agreement' | 'construction_management' | 'service_fee' | 'completed_leasehold' | 'vat' */
    componentType: text("component_type").notNull(),
    componentName: text("component_name").notNull(),
    /** 'percent_of_total' | 'flat_amount' | 'computed_remainder' */
    defaultAmountFormula: text("default_amount_formula").notNull(),
    defaultPercentValue: numeric("default_percent_value", {
      precision: 8,
      scale: 4,
    }),
    defaultFlatAmountUsdMinor: bigint("default_flat_amount_usd_minor", {
      mode: "bigint",
    }),
    defaultTaxRate: numeric("default_tax_rate", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    /** 'buyer' | 'seller' | 'split' */
    defaultTaxBearer: text("default_tax_bearer").notNull().default("buyer"),
    defaultSplitPercent: numeric("default_split_percent", {
      precision: 6,
      scale: 3,
    }),
    description: text("description"),
  },
  (t) => [index("ctc_template_seq_idx").on(t.templateId, t.sequence)],
);

// -----------------------------------------------------------------------------
// Sales schemes (template payment cadences) + scheme milestones
// -----------------------------------------------------------------------------

export const salesSchemes = pgTable(
  "sales_schemes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    isLocked: boolean("is_locked").notNull().default(false),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sales_schemes_project_idx").on(t.projectId)],
);

export const salesSchemeMilestones = pgTable(
  "sales_scheme_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salesSchemeId: uuid("sales_scheme_id")
      .notNull()
      .references(() => salesSchemes.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    /** 'on_signing' | 'construction_progress_pct' | 'days_after_previous'
     *  | 'days_after_signing' | 'fixed_date_offset' | 'on_handover' | 'days_after_handover' */
    triggerType: text("trigger_type").notNull(),
    triggerValue: numeric("trigger_value", { precision: 10, scale: 4 }),
    collectionPercent: numeric("collection_percent", {
      precision: 8,
      scale: 4,
    }).notNull(),
    preInvoiceDaysBeforeTrigger: integer("pre_invoice_days_before_trigger")
      .notNull()
      .default(7),
    dueDaysAfterInvoice: integer("due_days_after_invoice").notNull().default(14),
    isFinalPayment: boolean("is_final_payment").notNull().default(false),
    description: text("description"),
  },
  (t) => [index("ssm_scheme_seq_idx").on(t.salesSchemeId, t.sequence)],
);

// -----------------------------------------------------------------------------
// Contract groups + child contracts
// -----------------------------------------------------------------------------

export const contractGroups = pgTable(
  "contract_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Tenancy (migration 0162). NULLABLE — backfilled via project->org and
     * scoped at the action layer; not yet enforced NOT NULL.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => contractTemplates.id, { onDelete: "restrict" }),
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    /** 'off_plan_three_part' | 'completed_leasehold' */
    groupType: text("group_type").notNull(),
    totalContractValueUsdMinor: bigint("total_contract_value_usd_minor", {
      mode: "bigint",
    }).notNull(),
    totalContractValueIdrMinor: bigint("total_contract_value_idr_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateAtSigning: numeric("fx_rate_at_signing", {
      precision: 18,
      scale: 9,
    }).notNull(),
    salesSchemeId: uuid("sales_scheme_id").references(() => salesSchemes.id, {
      onDelete: "set null",
    }),
    /** 'draft' | 'pending_signature' | 'partial_signed' | 'fully_signed' | 'in_payment'
     *  | 'completed' | 'cancelled' | 'breached' */
    status: text("status").notNull().default("draft"),
    /** Plain uuid (FK enforced at SQL level — see migration) to break import cycle. */
    discountAppliedId: uuid("discount_applied_id"),
    marketPriceAtSigningUsdMinor: bigint("market_price_at_signing_usd_minor", {
      mode: "bigint",
    }).notNull(),
    priceSnapshotId: uuid("price_snapshot_id").references(
      () => unitPriceSnapshots.id,
      { onDelete: "set null" },
    ),
    contractDate: date("contract_date").notNull(),
    firstSignedAt: timestamp("first_signed_at", { withTimezone: true }),
    fullySignedAt: timestamp("fully_signed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contract_groups_villa_idx").on(t.villaId),
    index("contract_groups_contact_idx").on(t.contactId),
    index("contract_groups_project_status_idx").on(t.projectId, t.status),
    index("contract_groups_reservation_idx").on(t.reservationId),
    index("contract_groups_organization_idx").on(t.organizationId),
  ],
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractGroupId: uuid("contract_group_id")
      .notNull()
      .references(() => contractGroups.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    /** Same enum as contractTemplateComponents.componentType. */
    componentType: text("component_type").notNull(),
    componentName: text("component_name").notNull(),
    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    amountIdrMinor: bigint("amount_idr_minor", { mode: "bigint" }).notNull(),
    fxRate: numeric("fx_rate", { precision: 18, scale: 9 }).notNull(),
    taxRate: numeric("tax_rate", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    /** 'buyer' | 'seller' | 'split' */
    taxBearer: text("tax_bearer").notNull().default("buyer"),
    taxAmountUsdMinor: bigint("tax_amount_usd_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    netReceivedBySellerUsdMinor: bigint("net_received_by_seller_usd_minor", {
      mode: "bigint",
    }).notNull(),
    /** 'draft' | 'pending_signature' | 'signed' | 'cancelled' */
    status: text("status").notNull().default("draft"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedDocumentId: uuid("signed_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    generatedDraftDocumentId: uuid("generated_draft_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contracts_group_seq_idx").on(t.contractGroupId, t.sequence)],
);

// -----------------------------------------------------------------------------
// Contract milestones (per-group payment instances)
// -----------------------------------------------------------------------------

export const contractMilestones = pgTable(
  "contract_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Tenancy (migration 0162). NULLABLE — backfilled via
     * contract_group->org and scoped at the action layer; not yet NOT NULL.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    contractGroupId: uuid("contract_group_id")
      .notNull()
      .references(() => contractGroups.id, { onDelete: "cascade" }),
    sourceMilestoneId: uuid("source_milestone_id").references(
      () => salesSchemeMilestones.id,
      { onDelete: "set null" },
    ),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    triggerType: text("trigger_type").notNull(),
    triggerValue: numeric("trigger_value", { precision: 10, scale: 4 }),
    collectionPercent: numeric("collection_percent", {
      precision: 8,
      scale: 4,
    }).notNull(),
    expectedAmountUsdMinor: bigint("expected_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),
    expectedAmountIdrMinor: bigint("expected_amount_idr_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateExpected: numeric("fx_rate_expected", {
      precision: 18,
      scale: 9,
    }).notNull(),
    expectedDueDate: date("expected_due_date"),
    preInvoiceDate: date("pre_invoice_date"),
    /** 'pending' | 'pre_invoiced' | 'invoiced' | 'partially_paid' | 'paid' | 'overdue' | 'waived' | 'cancelled' */
    status: text("status").notNull().default("pending"),
    preInvoicedAt: timestamp("pre_invoiced_at", { withTimezone: true }),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
    paidAmountUsdMinor: bigint("paid_amount_usd_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    overdueAt: timestamp("overdue_at", { withTimezone: true }),
    lateFeeAccrualUsdMinor: bigint("late_fee_accrual_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contract_milestones_group_seq_idx").on(t.contractGroupId, t.sequence),
    index("contract_milestones_status_due_idx").on(t.status, t.expectedDueDate),
    index("contract_milestones_organization_idx").on(t.organizationId),
  ],
);

// -----------------------------------------------------------------------------
// Invoices
// -----------------------------------------------------------------------------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractMilestoneId: uuid("contract_milestone_id")
      .notNull()
      .references(() => contractMilestones.id, { onDelete: "cascade" }),
    contractGroupId: uuid("contract_group_id")
      .notNull()
      .references(() => contractGroups.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull().unique(),
    /** 'pre_invoice' | 'standard_invoice' | 'final_invoice' | 'late_fee_invoice' | 'credit_note' */
    invoiceType: text("invoice_type").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueDate: date("due_date").notNull(),
    amountUsdMinor: bigint("amount_usd_minor", { mode: "bigint" }).notNull(),
    amountIdrMinor: bigint("amount_idr_minor", { mode: "bigint" }).notNull(),
    fxRate: numeric("fx_rate", { precision: 18, scale: 9 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    language: text("language").notNull().default("en"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    /** 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'void' */
    status: text("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentTo: text("sent_to"),
    sentBy: uuid("sent_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedReason: text("voided_reason"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_milestone_idx").on(t.contractMilestoneId),
    index("invoices_contact_status_idx").on(t.contactId, t.status),
  ],
);

// -----------------------------------------------------------------------------
// Late fees
// -----------------------------------------------------------------------------

export const lateFeeRules = pgTable(
  "late_fee_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    gracePeriodDays: integer("grace_period_days").notNull().default(0),
    /** 'flat_fee' | 'percent_per_day' | 'percent_per_month' | 'tiered' */
    feeType: text("fee_type").notNull(),
    feeValue: numeric("fee_value", { precision: 12, scale: 4 }).notNull(),
    feeCurrency: text("fee_currency").notNull().default("USD"),
    maxFeeUsdMinor: bigint("max_fee_usd_minor", { mode: "bigint" }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("late_fee_rules_project_idx").on(t.projectId)],
);

export const lateFeeAccruals = pgTable(
  "late_fee_accruals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractMilestoneId: uuid("contract_milestone_id")
      .notNull()
      .references(() => contractMilestones.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => lateFeeRules.id, { onDelete: "restrict" }),
    accruedAt: timestamp("accrued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    daysOverdue: integer("days_overdue").notNull(),
    feeAmountUsdMinor: bigint("fee_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),
    feeAmountIdrMinor: bigint("fee_amount_idr_minor", {
      mode: "bigint",
    }).notNull(),
    fxRate: numeric("fx_rate", { precision: 18, scale: 9 }).notNull(),
    /** 'accrued' | 'invoiced' | 'paid' | 'waived' */
    status: text("status").notNull().default("accrued"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("late_fee_accruals_milestone_at_idx").on(
      t.contractMilestoneId,
      sql`${t.accruedAt} desc`,
    ),
  ],
);

// -----------------------------------------------------------------------------
// Discounts
// -----------------------------------------------------------------------------

export const discountAuthorizations = pgTable("discount_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleKey: text("role_key").notNull().unique(),
  maxPercentValue: numeric("max_percent_value", { precision: 8, scale: 4 }),
  maxAbsoluteUsdMinor: bigint("max_absolute_usd_minor", { mode: "bigint" }),
  requiresEscalationAbovePercent: numeric("requires_escalation_above_percent", {
    precision: 8,
    scale: 4,
  }),
  escalateToRoleKey: text("escalate_to_role_key"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const unitDiscounts = pgTable(
  "unit_discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    contractGroupId: uuid("contract_group_id").references(
      () => contractGroups.id,
      { onDelete: "set null" },
    ),
    /** 'percent' | 'fixed_amount' */
    discountType: text("discount_type").notNull(),
    discountPercent: numeric("discount_percent", { precision: 8, scale: 4 }),
    discountAmountUsdMinor: bigint("discount_amount_usd_minor", {
      mode: "bigint",
    }),
    appliedToOriginalPriceUsdMinor: bigint(
      "applied_to_original_price_usd_minor",
      { mode: "bigint" },
    ).notNull(),
    finalPriceUsdMinor: bigint("final_price_usd_minor", {
      mode: "bigint",
    }).notNull(),
    /** 'early_bird' | 'family_friend' | 'cash_payment' | 'bulk' | 'agent_negotiation'
     *  | 'returning_buyer' | 'investor_relationship' | 'other' */
    reason: text("reason").notNull(),
    reasonNote: text("reason_note"),
    proposedBy: uuid("proposed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    proposedAt: timestamp("proposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    authorizedBy: uuid("authorized_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    /** 'proposed' | 'pending_approval' | 'approved' | 'rejected' | 'applied' | 'reverted' */
    status: text("status").notNull().default("proposed"),
    escalationRequired: boolean("escalation_required").notNull().default(false),
    escalatedTo: uuid("escalated_to").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unit_discounts_villa_idx").on(t.villaId),
    index("unit_discounts_contact_idx").on(t.contactId),
    index("unit_discounts_status_idx").on(t.status),
    index("unit_discounts_contract_idx").on(t.contractGroupId),
  ],
);

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------

export const devNotificationRules = pgTable(
  "dev_notification_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    ruleName: text("rule_name").notNull(),
    description: text("description"),
    /** trigger event — see migration check */
    triggerEvent: text("trigger_event").notNull(),
    triggerOffsetDays: integer("trigger_offset_days").notNull().default(0),
    /** 'buyer' | 'sales_manager' | 'project_manager' | 'admin' | 'specific_role' | 'specific_user' */
    recipientType: text("recipient_type").notNull(),
    recipientRoleKey: text("recipient_role_key"),
    recipientUserId: uuid("recipient_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** 'email' | 'whatsapp' | 'sms' | 'in_app' */
    channel: text("channel").notNull(),
    templateName: text("template_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_rules_trigger_idx")
      .on(t.triggerEvent)
      .where(sql`${t.isActive} = true`),
  ],
);

export const devNotificationTemplates = pgTable("dev_notification_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  // TENANT-1: added by migration 0072 (multi-tenant propagation).
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  templateName: text("template_name").notNull().unique(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  language: text("language").notNull().default("en"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const devNotificationDeliveryLog = pgTable(
  "dev_notification_delivery_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    ruleId: uuid("rule_id").references(() => devNotificationRules.id, {
      onDelete: "set null",
    }),
    triggerEntityType: text("trigger_entity_type").notNull(),
    triggerEntityId: uuid("trigger_entity_id").notNull(),
    recipientContactId: uuid("recipient_contact_id").references(
      () => contacts.id,
      { onDelete: "set null" },
    ),
    recipientUserId: uuid("recipient_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    recipientAddress: text("recipient_address"),
    /** 'email' | 'whatsapp' | 'sms' | 'in_app' */
    channel: text("channel").notNull(),
    templateName: text("template_name").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' */
    status: text("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    errorReason: text("error_reason"),
    externalMessageId: text("external_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_delivery_entity_idx").on(
      t.triggerEntityType,
      t.triggerEntityId,
    ),
    index("notification_delivery_status_at_idx").on(
      t.status,
      sql`${t.createdAt} desc`,
    ),
  ],
);

// -----------------------------------------------------------------------------
// Inferred types (for server-side use only — pure types live in lib/development/types)
// -----------------------------------------------------------------------------

export type PricingRule = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;
export type UnitPriceSnapshot = typeof unitPriceSnapshots.$inferSelect;
export type NewUnitPriceSnapshot = typeof unitPriceSnapshots.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type ContractTemplateComponent =
  typeof contractTemplateComponents.$inferSelect;
export type SalesScheme = typeof salesSchemes.$inferSelect;
export type SalesSchemeMilestone = typeof salesSchemeMilestones.$inferSelect;
export type ContractGroup = typeof contractGroups.$inferSelect;
export type NewContractGroup = typeof contractGroups.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type ContractMilestone = typeof contractMilestones.$inferSelect;
export type NewContractMilestone = typeof contractMilestones.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type LateFeeRule = typeof lateFeeRules.$inferSelect;
export type LateFeeAccrual = typeof lateFeeAccruals.$inferSelect;
export type NewLateFeeAccrual = typeof lateFeeAccruals.$inferInsert;
export type DiscountAuthorization = typeof discountAuthorizations.$inferSelect;
export type UnitDiscount = typeof unitDiscounts.$inferSelect;
export type NewUnitDiscount = typeof unitDiscounts.$inferInsert;
export type DevNotificationRule = typeof devNotificationRules.$inferSelect;
export type DevNotificationTemplate = typeof devNotificationTemplates.$inferSelect;
export type DevNotificationDelivery = typeof devNotificationDeliveryLog.$inferSelect;
export type NewDevNotificationDelivery =
  typeof devNotificationDeliveryLog.$inferInsert;
