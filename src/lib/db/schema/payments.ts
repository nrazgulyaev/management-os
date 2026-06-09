import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { organizations } from "./saas";
import {
  directBookingHolds,
  directBookingRequests,
} from "./direct-booking";

/**
 * Prompt 106 — Payment provider stub + direct-booking deposit workflow.
 *
 * `payment_provider_accounts` is the configuration table; the manual
 * stub provider is the only one wired today, but the schema accepts
 * Stripe / Xendit / Wise / bank_transfer rows so future integrations
 * are additive.
 *
 * `direct_booking_deposits` is the gate that sits between an approved
 * `direct_booking_request` and a confirmed `bookings` row. The
 * conversion action only writes a `confirmed` booking when a deposit
 * row exists with status `paid` or `manually_marked_paid`.
 *
 * `payment_webhook_events` is the idempotent envelope for incoming
 * provider webhooks. The manual stub never writes to this table — it
 * exists so a future Stripe / Xendit integration can drop straight
 * in without a migration.
 */

export const paymentProviderAccounts = pgTable(
  "payment_provider_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (no natural parent FK). Not
    // threaded into queries yet; column stays NULLABLE for now.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    providerKey: text("provider_key").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    mode: text("mode").notNull().default("test"),
    supportedCurrencies: text("supported_currencies").array(),
    configPublicJson: jsonb("config_public_json"),
    configPrivateEncrypted: text("config_private_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payment_provider_accounts_status_idx").on(t.status),
    index("payment_provider_accounts_provider_key_idx").on(t.providerKey),
    index("payment_provider_accounts_org_idx").on(t.organizationId),
  ],
);

export const directBookingDeposits = pgTable(
  "direct_booking_deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    holdId: uuid("hold_id").references(() => directBookingHolds.id, {
      onDelete: "cascade",
    }),
    requestId: uuid("request_id").references(() => directBookingRequests.id, {
      onDelete: "cascade",
    }),
    providerAccountId: uuid("provider_account_id").references(
      () => paymentProviderAccounts.id,
      { onDelete: "set null" },
    ),
    depositCode: text("deposit_code").notNull().unique(),
    providerKey: text("provider_key").notNull().default("manual_stub"),
    providerSessionId: text("provider_session_id"),
    providerPaymentId: text("provider_payment_id"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("draft"),
    paymentUrl: text("payment_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    // Prompt 107 — balance owed after deposit (cached on the row so
    // dashboards can sort without joining the request total).
    balanceDueMinor: bigint("balance_due_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    /** Reason captured when the expiry job flipped the deposit. */
    expiresReason: text("expires_reason"),
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
    index("direct_booking_deposits_request_idx").on(t.requestId),
    index("direct_booking_deposits_hold_idx").on(t.holdId),
    index("direct_booking_deposits_status_idx").on(t.status),
    index("direct_booking_deposits_org_idx").on(t.organizationId),
  ],
);

export const directBookingDepositEvents = pgTable(
  "direct_booking_deposit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via the parent deposit. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    depositId: uuid("deposit_id")
      .notNull()
      .references(() => directBookingDeposits.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    message: text("message"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_deposit_events_deposit_idx").on(
      t.depositId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_deposit_events_type_idx").on(t.eventType),
    index("direct_booking_deposit_events_org_idx").on(t.organizationId),
  ],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (provider webhooks land before
    // any org resolution). Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    providerKey: text("provider_key").notNull(),
    externalEventId: text("external_event_id"),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    status: text("status").notNull().default("received"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_webhook_events_external_unique")
      .on(t.providerKey, t.externalEventId)
      .where(sql`${t.externalEventId} IS NOT NULL`),
    index("payment_webhook_events_provider_idx").on(t.providerKey),
    index("payment_webhook_events_status_idx").on(t.status),
    index("payment_webhook_events_org_idx").on(t.organizationId),
  ],
);

export type PaymentProviderAccount =
  typeof paymentProviderAccounts.$inferSelect;
export type NewPaymentProviderAccount =
  typeof paymentProviderAccounts.$inferInsert;
export type DirectBookingDeposit = typeof directBookingDeposits.$inferSelect;
export type NewDirectBookingDeposit =
  typeof directBookingDeposits.$inferInsert;
export type DirectBookingDepositEvent =
  typeof directBookingDepositEvents.$inferSelect;
export type NewDirectBookingDepositEvent =
  typeof directBookingDepositEvents.$inferInsert;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type NewPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;
