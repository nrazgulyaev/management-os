import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  numeric,
  jsonb,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { bookings } from "./bookings";
import { guestStayTokens } from "./guest-stays";
import {
  guestServices,
  guestServiceOrders,
} from "./guest-services";
import { documents } from "./documents";
import { revenueLines, expenseLines } from "./finance";
import { organizations } from "./saas";

/**
 * Prompt 103 — Service Fulfilment & Vendor Ops.
 *
 * Eight tables form the operational layer behind a guest service
 * order: who fulfils it (vendor or staff), when, how much we paid,
 * how much we charged, what the guest rated it, and how the resulting
 * line items hit finance.
 */

export const serviceVendors = pgTable(
  "service_vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    vendorCode: text("vendor_code").notNull().unique(),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    vendorType: text("vendor_type").notNull(),
    status: text("status").notNull().default("active"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    preferredChannel: text("preferred_channel"),
    serviceArea: text("service_area"),
    languages: text("languages").array(),
    defaultCurrency: text("default_currency").notNull().default("USD"),
    internalNotes: text("internal_notes"),
    ratingAverage: numeric("rating_average", { precision: 3, scale: 2 }),
    ratingCount: integer("rating_count").notNull().default(0),
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
    index("service_vendors_status_idx").on(t.status),
    index("service_vendors_type_idx").on(t.vendorType),
    index("service_vendors_display_name_idx").on(t.displayName),
    index("service_vendors_org_idx").on(t.organizationId),
  ],
);

export const serviceVendorServices = pgTable(
  "service_vendor_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => serviceVendors.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => guestServices.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    baseCostMinor: bigint("base_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    leadTimeMinutes: integer("lead_time_minutes"),
    minNoticeMinutes: integer("min_notice_minutes"),
    capacityJson: jsonb("capacity_json"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("service_vendor_services_pair_unique").on(
      t.vendorId,
      t.serviceId,
    ),
    index("service_vendor_services_service_idx").on(t.serviceId),
    index("service_vendor_services_status_idx").on(t.status),
    index("service_vendor_services_org_idx").on(t.organizationId),
  ],
);

export const guestServiceFulfilments = pgTable(
  "guest_service_fulfilments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => guestServiceOrders.id, { onDelete: "cascade" }),
    fulfilmentCode: text("fulfilment_code").notNull().unique(),
    vendorId: uuid("vendor_id").references(() => serviceVendors.id, {
      onDelete: "set null",
    }),
    assignedToAppUserId: uuid("assigned_to_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("new"),
    fulfilmentType: text("fulfilment_type").notNull().default("internal"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    etaAt: timestamp("eta_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    guestStatusLabel: text("guest_status_label"),
    internalStatusReason: text("internal_status_reason"),
    vendorQuoteMinor: bigint("vendor_quote_minor", { mode: "bigint" }),
    internalCostMinor: bigint("internal_cost_minor", { mode: "bigint" }),
    guestPriceMinor: bigint("guest_price_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),
    marginMinor: bigint("margin_minor", { mode: "bigint" }),
    requiresGuestConfirmation: boolean("requires_guest_confirmation")
      .notNull()
      .default(false),
    guestConfirmedAt: timestamp("guest_confirmed_at", {
      withTimezone: true,
    }),
    vendorConfirmedAt: timestamp("vendor_confirmed_at", {
      withTimezone: true,
    }),
    vendorReference: text("vendor_reference"),
    vendorNotes: text("vendor_notes"),
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
    uniqueIndex("guest_service_fulfilments_order_unique").on(t.orderId),
    index("guest_service_fulfilments_status_idx").on(t.status),
    index("guest_service_fulfilments_vendor_idx").on(t.vendorId),
    index("guest_service_fulfilments_scheduled_idx").on(t.scheduledFor),
    index("guest_service_fulfilments_assigned_idx").on(t.assignedToAppUserId),
    index("guest_service_fulfilments_org_idx").on(t.organizationId),
  ],
);

export const serviceFulfilmentEvents = pgTable(
  "service_fulfilment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    fulfilmentId: uuid("fulfilment_id")
      .notNull()
      .references(() => guestServiceFulfilments.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull().default("system"),
    actorAppUserId: uuid("actor_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    vendorId: uuid("vendor_id").references(() => serviceVendors.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_fulfilment_events_fulfilment_idx").on(
      t.fulfilmentId,
      sql`${t.createdAt} DESC`,
    ),
    index("service_fulfilment_events_type_idx").on(t.eventType),
    index("service_fulfilment_events_org_idx").on(t.organizationId),
  ],
);

export const serviceVendorTokens = pgTable(
  "service_vendor_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    fulfilmentId: uuid("fulfilment_id")
      .notNull()
      .references(() => guestServiceFulfilments.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => serviceVendors.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
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
    index("service_vendor_tokens_vendor_idx").on(t.vendorId),
    index("service_vendor_tokens_fulfilment_idx").on(t.fulfilmentId),
    index("service_vendor_tokens_status_idx").on(t.status),
    index("service_vendor_tokens_expires_idx").on(t.expiresAt),
    index("service_vendor_tokens_org_idx").on(t.organizationId),
  ],
);

export const serviceVendorInvoices = pgTable(
  "service_vendor_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    fulfilmentId: uuid("fulfilment_id")
      .notNull()
      .references(() => guestServiceFulfilments.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => serviceVendors.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number"),
    invoiceStatus: text("invoice_status").notNull().default("draft"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    invoiceDate: date("invoice_date"),
    dueDate: date("due_date"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    approvedBy: uuid("approved_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_vendor_invoices_vendor_idx").on(t.vendorId),
    index("service_vendor_invoices_fulfilment_idx").on(t.fulfilmentId),
    index("service_vendor_invoices_status_idx").on(t.invoiceStatus),
    index("service_vendor_invoices_due_idx").on(t.dueDate),
    index("service_vendor_invoices_org_idx").on(t.organizationId),
  ],
);

export const guestServiceRatings = pgTable(
  "guest_service_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    orderId: uuid("order_id").references(() => guestServiceOrders.id, {
      onDelete: "set null",
    }),
    fulfilmentId: uuid("fulfilment_id")
      .notNull()
      .references(() => guestServiceFulfilments.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    stayTokenId: uuid("stay_token_id").references(() => guestStayTokens.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references(() => serviceVendors.id, {
      onDelete: "set null",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    sentiment: text("sentiment"),
    status: text("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_service_ratings_fulfilment_token_unique").on(
      t.fulfilmentId,
      t.stayTokenId,
    ),
    index("guest_service_ratings_vendor_idx").on(t.vendorId),
    index("guest_service_ratings_status_idx").on(t.status),
    index("guest_service_ratings_org_idx").on(t.organizationId),
  ],
);

export const serviceFulfilmentFinanceLinks = pgTable(
  "service_fulfilment_finance_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    fulfilmentId: uuid("fulfilment_id")
      .notNull()
      .references(() => guestServiceFulfilments.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => guestServiceOrders.id, { onDelete: "cascade" }),
    revenueLineId: uuid("revenue_line_id").references(
      () => revenueLines.id,
      { onDelete: "set null" },
    ),
    expenseLineId: uuid("expense_line_id").references(
      () => expenseLines.id,
      { onDelete: "set null" },
    ),
    vendorInvoiceId: uuid("vendor_invoice_id").references(
      () => serviceVendorInvoices.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"),
    amountRevenueMinor: bigint("amount_revenue_minor", { mode: "bigint" }),
    amountExpenseMinor: bigint("amount_expense_minor", { mode: "bigint" }),
    currency: text("currency"),
    errorMessage: text("error_message"),
    bridgedAt: timestamp("bridged_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("service_fulfilment_finance_links_fulfilment_unique").on(
      t.fulfilmentId,
    ),
    index("service_fulfilment_finance_links_status_idx").on(t.status),
    index("service_fulfilment_finance_links_org_idx").on(t.organizationId),
  ],
);

export type ServiceVendor = typeof serviceVendors.$inferSelect;
export type NewServiceVendor = typeof serviceVendors.$inferInsert;
export type ServiceVendorService = typeof serviceVendorServices.$inferSelect;
export type NewServiceVendorService =
  typeof serviceVendorServices.$inferInsert;
export type GuestServiceFulfilment =
  typeof guestServiceFulfilments.$inferSelect;
export type NewGuestServiceFulfilment =
  typeof guestServiceFulfilments.$inferInsert;
export type ServiceFulfilmentEvent =
  typeof serviceFulfilmentEvents.$inferSelect;
export type NewServiceFulfilmentEvent =
  typeof serviceFulfilmentEvents.$inferInsert;
export type ServiceVendorToken = typeof serviceVendorTokens.$inferSelect;
export type NewServiceVendorToken = typeof serviceVendorTokens.$inferInsert;
export type ServiceVendorInvoice = typeof serviceVendorInvoices.$inferSelect;
export type NewServiceVendorInvoice =
  typeof serviceVendorInvoices.$inferInsert;
export type GuestServiceRating = typeof guestServiceRatings.$inferSelect;
export type NewGuestServiceRating = typeof guestServiceRatings.$inferInsert;
export type ServiceFulfilmentFinanceLink =
  typeof serviceFulfilmentFinanceLinks.$inferSelect;
export type NewServiceFulfilmentFinanceLink =
  typeof serviceFulfilmentFinanceLinks.$inferInsert;
