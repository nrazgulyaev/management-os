/**
 * Stage 6.P3.A — Payment processors schema (Stripe / Wise Payments / etc).
 *
 * 3 tables (migration 0080):
 *   - payment_processor_connections   per-processor config (Stripe, Wise
 *                                     Payments, PayPal, manual). Encrypted
 *                                     credentials, capabilities + supported
 *                                     currencies, fee structure JSON.
 *   - payment_intents                 every payment we initiate. Linked
 *                                     to internal records (invoice / vendor /
 *                                     reservation / investor / buyer).
 *   - payment_attempts                individual attempts within an intent.
 *                                     Append-only.
 *
 * Coexists with the existing `payments.ts` (Prompt 106) which covers
 * direct-booking deposits + the manual stub provider. The P3 surface is
 * the "modern" processor abstraction; the older deposit workflow stays
 * in place for now and is bridged in P3.G via the reconciliation engine.
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
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { invoices } from "./sales";
import { vendors } from "./site-operations";

// ---------------------------------------------------------------------------
// payment_processor_connections
// ---------------------------------------------------------------------------
export const paymentProcessorConnections = pgTable(
  "payment_processor_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** PaymentProviderName */
    provider: text("provider").notNull(),

    externalAccountId: text("external_account_id").notNull(),
    accountName: text("account_name"),

    /** PaymentMode FSM */
    mode: text("mode").notNull(),

    /** ConnectionStatus FSM (shared with banking) */
    status: text("status").notNull().default("pending"),

    /** Encrypted credentials (STAY_LINK_KMS_SECRET, P1.B helper). */
    credentials: jsonb("credentials"),

    /** PaymentCapability[] — e.g. ['card_payments','refunds','payouts']. */
    capabilities: text("capabilities").array().notNull().default(sql`'{}'`),
    supportedCurrencies: text("supported_currencies")
      .array()
      .notNull()
      .default(sql`'{}'`),

    feeStructure: jsonb("fee_structure"),

    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    totalPaymentsProcessed: integer("total_payments_processed")
      .notNull()
      .default(0),
    totalVolumeMinor: bigint("total_volume_minor", { mode: "bigint" })
      .notNull()
      .default(0n),

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
    unique("payment_processor_provider_account_unique").on(
      t.organizationId,
      t.provider,
      t.externalAccountId,
    ),
    index("payment_processor_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// payment_intents
// ---------------------------------------------------------------------------
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    processorConnectionId: uuid("processor_connection_id")
      .notNull()
      .references(() => paymentProcessorConnections.id, {
        onDelete: "cascade",
      }),

    externalIntentId: text("external_intent_id").notNull(),
    externalStatus: text("external_status"),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),

    feesMinor: bigint("fees_minor", { mode: "bigint" }),
    netAmountMinor: bigint("net_amount_minor", { mode: "bigint" }),

    /** PaymentPurpose FSM */
    purpose: text("purpose").notNull(),

    /** Soft links — no FK because some target tables live in modules
     *  imported elsewhere; the linkage is informational. */
    linkedReservationId: uuid("linked_reservation_id"),
    linkedInvoiceId: uuid("linked_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    linkedInvestorId: uuid("linked_investor_id"),
    linkedBuyerId: uuid("linked_buyer_id"),
    linkedVendorId: uuid("linked_vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Soft link (migration 0166) — the contract milestone (buyer
     *  installment) this intent settles. No FK by design (sales module
     *  lives elsewhere; consistent with the other soft links). */
    linkedContractMilestoneId: uuid("linked_contract_milestone_id"),

    customerEmail: text("customer_email"),
    customerName: text("customer_name"),
    customerCountry: text("customer_country"),

    /** PaymentLifecycleState FSM */
    lifecycleState: text("lifecycle_state").notNull().default("created"),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),

    refundAmountMinor: bigint("refund_amount_minor", { mode: "bigint" }),
    refundReason: text("refund_reason"),

    rawPayload: jsonb("raw_payload"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("payment_intents_external_unique").on(
      t.processorConnectionId,
      t.externalIntentId,
    ),
    index("payment_intents_org_idx").on(t.organizationId),
    index("payment_intents_state_idx").on(t.lifecycleState),
    index("payment_intents_purpose_idx").on(t.purpose),
  ],
);

// ---------------------------------------------------------------------------
// payment_attempts
// ---------------------------------------------------------------------------
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "cascade" }),

    externalAttemptId: text("external_attempt_id").notNull(),
    methodType: text("method_type"),
    methodDetails: jsonb("method_details"),

    status: text("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    feeMinor: bigint("fee_minor", { mode: "bigint" }),

    rawPayload: jsonb("raw_payload"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payment_attempts_intent_idx").on(t.paymentIntentId),
    index("payment_attempts_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type PaymentProcessorConnection =
  typeof paymentProcessorConnections.$inferSelect;
export type NewPaymentProcessorConnection =
  typeof paymentProcessorConnections.$inferInsert;
export type PaymentIntentRow = typeof paymentIntents.$inferSelect;
export type NewPaymentIntentRow = typeof paymentIntents.$inferInsert;
export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttemptRow = typeof paymentAttempts.$inferInsert;

// ---------------------------------------------------------------------------
// String-union types — mirror SQL CHECK constraints
// ---------------------------------------------------------------------------

export type PaymentProviderName =
  | "stripe"
  | "wise_payments"
  | "paypal"
  | "manual"
  | "xendit";

export const PAYMENT_PROVIDERS: readonly PaymentProviderName[] = [
  "stripe",
  "wise_payments",
  "paypal",
  "manual",
  "xendit",
] as const;

export type PaymentMode = "test" | "live";

export type PaymentCapability =
  | "card_payments"
  | "bank_transfers"
  | "recurring"
  | "refunds"
  | "payouts";

export type PaymentPurpose =
  | "reservation_deposit"
  | "reservation_balance"
  | "investor_capital_call"
  | "vendor_payment"
  | "tax_payment"
  | "commission_payment"
  | "refund"
  | "buyer_installment"
  | "other";

export const PAYMENT_PURPOSES: readonly PaymentPurpose[] = [
  "reservation_deposit",
  "reservation_balance",
  "investor_capital_call",
  "vendor_payment",
  "tax_payment",
  "commission_payment",
  "refund",
  "buyer_installment",
  "other",
] as const;

export type PaymentLifecycleState =
  | "created"
  | "processing"
  | "requires_action"
  | "succeeded"
  | "cancelled"
  | "failed"
  | "refunded";

export const PAYMENT_LIFECYCLE_STATES: readonly PaymentLifecycleState[] = [
  "created",
  "processing",
  "requires_action",
  "succeeded",
  "cancelled",
  "failed",
  "refunded",
] as const;
