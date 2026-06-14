import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { bookings, guests } from "./bookings";
import { appUsers } from "./identity";
import { guestStayTokens } from "./guest-stays";
import { serviceRequests, operationTasks } from "./operations";
import { revenueLines, expenseLines } from "./finance";
import { organizations } from "./saas";

/**
 * V9F — guest services catalog, upsell orders, concierge fulfilment, and the
 * guest-service revenue foundation.
 *
 * Money rule: every monetary column is BIGINT minor units of `currency`.
 * Internal cost stays on the order row (and on the catalog row) so margin
 * analytics never round-trips back through expense_lines for a guest service.
 *
 * RLS posture: every table is internal-only at the DB layer (force RLS +
 * `internal_read`). The guest portal never reads/writes these tables through
 * an authenticated guest session — the server route validates a stay token
 * and uses the service-role client to apply changes.
 */

export const guestServiceCategories = pgTable(
  "guest_service_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("guest_service_categories_status_idx").on(t.status)],
);

export const guestServices = pgTable(
  "guest_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").references(() => guestServiceCategories.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    /** TENANCY (migration 0152 add, 0158 NOT NULL): org anchor from
     *  requireOrgId() on catalog create (thread-portal unit). */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    serviceKey: text("service_key").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description"),
    descriptionMd: text("description_md"),
    imageUrl: text("image_url"),
    serviceType: text("service_type").notNull(),
    pricingModel: text("pricing_model").notNull().default("fixed"),
    basePriceMinor: bigint("base_price_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    internalCostMinor: bigint("internal_cost_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),
    requiresDate: boolean("requires_date").notNull().default(true),
    requiresTime: boolean("requires_time").notNull().default(false),
    requiresGuestCount: boolean("requires_guest_count").notNull().default(false),
    requiresAdminConfirmation: boolean("requires_admin_confirmation")
      .notNull()
      .default(true),
    allowMultipleDays: boolean("allow_multiple_days").notNull().default(false),
    minQuantity: integer("min_quantity").notNull().default(1),
    maxQuantity: integer("max_quantity"),
    leadTimeHours: integer("lead_time_hours"),
    cancellationPolicyMd: text("cancellation_policy_md"),
    guestVisible: boolean("guest_visible").notNull().default(true),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
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
    uniqueIndex("guest_services_scope_key_unique")
      .on(
        sql`COALESCE(${t.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        sql`COALESCE(${t.villaId},   '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.serviceKey,
      )
      .where(sql`${t.status} <> 'archived'`),
    index("guest_services_category_idx").on(t.categoryId),
    index("guest_services_project_idx").on(t.projectId),
    index("guest_services_villa_idx").on(t.villaId),
    index("guest_services_status_idx").on(t.status),
    index("guest_services_organization_idx").on(t.organizationId),
    // PERF: the services catalog reads org + status='active' on every admin
    // and guest-portal services page.
    index("guest_services_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const guestServiceOptions = pgTable(
  "guest_service_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => guestServices.id, { onDelete: "cascade" }),
    optionKey: text("option_key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    priceDeltaMinor: bigint("price_delta_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    internalCostDeltaMinor: bigint("internal_cost_delta_minor", {
      mode: "bigint",
    }),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_service_options_unique")
      .on(t.serviceId, t.optionKey)
      .where(sql`${t.status} = 'active'`),
    index("guest_service_options_service_idx").on(t.serviceId),
  ],
);

export const guestServiceOrders = pgTable(
  "guest_service_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderCode: text("order_code").notNull().unique(),
    guestStayTokenId: uuid("guest_stay_token_id").references(
      () => guestStayTokens.id,
      { onDelete: "set null" },
    ),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    guestId: uuid("guest_id").references(() => guests.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => guestServices.id, { onDelete: "restrict" }),
    selectedOptionId: uuid("selected_option_id").references(
      () => guestServiceOptions.id,
      { onDelete: "set null" },
    ),
    requestedDate: date("requested_date"),
    requestedTime: text("requested_time"),
    requestedStartAt: timestamp("requested_start_at", { withTimezone: true }),
    requestedEndAt: timestamp("requested_end_at", { withTimezone: true }),
    quantity: integer("quantity").notNull().default(1),
    guestCount: integer("guest_count"),
    guestNote: text("guest_note"),
    internalNote: text("internal_note"),
    status: text("status").notNull().default("requested"),
    guestPriceMinor: bigint("guest_price_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    internalCostMinor: bigint("internal_cost_minor", { mode: "bigint" }),
    marginMinor: bigint("margin_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),
    requiresAdminConfirmation: boolean("requires_admin_confirmation")
      .notNull()
      .default(true),
    assignedTo: uuid("assigned_to").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    linkedServiceRequestId: uuid("linked_service_request_id").references(
      () => serviceRequests.id,
      { onDelete: "set null" },
    ),
    linkedOperationTaskId: uuid("linked_operation_task_id").references(
      () => operationTasks.id,
      { onDelete: "set null" },
    ),
    linkedRevenueLineId: uuid("linked_revenue_line_id").references(
      () => revenueLines.id,
      { onDelete: "set null" },
    ),
    financeBridgeStatus: text("finance_bridge_status")
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    index("guest_service_orders_token_idx").on(t.guestStayTokenId),
    index("guest_service_orders_booking_idx").on(t.bookingId),
    index("guest_service_orders_villa_idx").on(t.villaId),
    index("guest_service_orders_service_idx").on(t.serviceId),
    index("guest_service_orders_status_idx").on(t.status),
    index("guest_service_orders_finance_bridge_idx").on(t.financeBridgeStatus),
    index("guest_service_orders_requested_date_idx").on(t.requestedDate),
  ],
);

export const guestServiceOrderEvents = pgTable(
  "guest_service_order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => guestServiceOrders.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull().default("system"),
    actorAppUserId: uuid("actor_app_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    message: text("message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_service_order_events_order_idx").on(
      t.orderId,
      sql`${t.createdAt} DESC`,
    ),
  ],
);

export const guestServiceFinanceLinks = pgTable(
  "guest_service_finance_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => guestServiceOrders.id, { onDelete: "cascade" }),
    revenueLineId: uuid("revenue_line_id").references(() => revenueLines.id, {
      onDelete: "set null",
    }),
    expenseLineId: uuid("expense_line_id").references(() => expenseLines.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currency: text("currency").notNull().default("USD"),
    reason: text("reason"),
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
    uniqueIndex("guest_service_finance_links_order_unique").on(t.orderId),
    index("guest_service_finance_links_status_idx").on(t.status),
  ],
);

export type GuestServiceCategory = typeof guestServiceCategories.$inferSelect;
export type NewGuestServiceCategory =
  typeof guestServiceCategories.$inferInsert;
export type GuestService = typeof guestServices.$inferSelect;
export type NewGuestService = typeof guestServices.$inferInsert;
export type GuestServiceOption = typeof guestServiceOptions.$inferSelect;
export type NewGuestServiceOption = typeof guestServiceOptions.$inferInsert;
export type GuestServiceOrder = typeof guestServiceOrders.$inferSelect;
export type NewGuestServiceOrder = typeof guestServiceOrders.$inferInsert;
export type GuestServiceOrderEvent =
  typeof guestServiceOrderEvents.$inferSelect;
export type NewGuestServiceOrderEvent =
  typeof guestServiceOrderEvents.$inferInsert;
export type GuestServiceFinanceLink =
  typeof guestServiceFinanceLinks.$inferSelect;
export type NewGuestServiceFinanceLink =
  typeof guestServiceFinanceLinks.$inferInsert;
