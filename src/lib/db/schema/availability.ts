import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { villas } from "./projects";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { bookings } from "./bookings";
import { operationTasks } from "./operations";
import { organizations } from "./saas";

/**
 * V9A — master availability primitive. Every reason a villa is "not for
 * sale tonight" lives here: confirmed bookings, owner stays, deep
 * cleans, maintenance blocks, OOO, internal/channel holds.
 *
 * `[starts_at, ends_at)` half-open interval — back-to-back stays
 * (`a.ends_at == b.starts_at`) are NOT a conflict. Booking sync writes
 * the booking's check-in midnight UTC → check-out midnight UTC.
 */
export const villaCalendarBlocks = pgTable(
  "villa_calendar_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    // TENANCY (migration 0149): nullable org anchor via villa -> project.
    organizationId: uuid("organization_id").references(() => organizations.id),
    blockType: text("block_type").notNull(),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    ownerVisible: boolean("owner_visible").notNull().default(false),
    guestVisible: boolean("guest_visible").notNull().default(false),
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
    index("villa_calendar_blocks_villa_idx").on(t.villaId, t.startsAt),
    index("villa_calendar_blocks_status_idx").on(t.status),
    index("villa_calendar_blocks_block_type_idx").on(t.blockType),
    index("villa_calendar_blocks_source_idx").on(t.sourceType, t.sourceId),
    index("villa_calendar_blocks_organization_idx").on(t.organizationId),
  ],
);

/**
 * V9A — readiness timeline. Append-only; the "current" row is the one
 * with `effective_to = NULL`. A partial unique index in the migration
 * enforces at most one open row per villa, so set-current logic must
 * close the previous row first.
 */
export const villaReadinessStates = pgTable(
  "villa_readiness_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    // TENANCY (migration 0149): nullable org anchor via villa -> project.
    organizationId: uuid("organization_id").references(() => organizations.id),
    readinessStatus: text("readiness_status").notNull().default("unknown"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    relatedBookingId: uuid("related_booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    relatedTaskId: uuid("related_task_id").references(() => operationTasks.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    changedBy: uuid("changed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("villa_readiness_states_villa_idx").on(
      t.villaId,
      sql`${t.effectiveFrom} DESC`,
    ),
    index("villa_readiness_states_status_idx").on(t.readinessStatus),
    index("villa_readiness_states_organization_idx").on(t.organizationId),
    uniqueIndex("villa_readiness_states_open_unique")
      .on(t.villaId)
      .where(sql`${t.effectiveTo} IS NULL`),
  ],
);

/**
 * V9A — front-office event ledger. One row per state transition the
 * front desk cares about (pre-arrival, arrival_due, checked_in, …).
 * Booking.status remains the source of truth; this table is a
 * higher-resolution audit trail.
 */
export const bookingStayEvents = pgTable(
  "booking_stay_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // TENANCY (0149 add/backfill via booking; 0155 NOT NULL cutover).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("booking_stay_events_booking_idx").on(
      t.bookingId,
      sql`${t.eventAt} DESC`,
    ),
    index("booking_stay_events_type_idx").on(t.eventType),
    index("booking_stay_events_organization_idx").on(t.organizationId),
  ],
);

/**
 * V9A — early/late checkout + expected-checkout-time + early-checkout
 * notice requests. Lives separately from `service_requests` so the
 * front desk can manage approvals/fees without polluting guest
 * concierge surfaces.
 */
export const checkinCheckoutRequests = pgTable(
  "checkin_checkout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    // TENANCY (0149 add/backfill via booking; 0155 NOT NULL cutover).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestType: text("request_type").notNull(),
    requestedTime: timestamp("requested_time", { withTimezone: true }),
    status: text("status").notNull().default("requested"),
    feeAmountMinor: bigint("fee_amount_minor", { mode: "number" }),
    currency: text("currency"),
    adminNotes: text("admin_notes"),
    guestMessage: text("guest_message"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("checkin_checkout_requests_booking_idx").on(t.bookingId),
    index("checkin_checkout_requests_status_idx").on(t.status),
    index("checkin_checkout_requests_organization_idx").on(t.organizationId),
  ],
);

/**
 * V9A — fine-grained "who is on the hook" mapping. A user_role grants
 * the role-level permissions; a responsibility scope narrows the
 * actionable surface to a project / villa / category.
 */
export const userResponsibilityScopes = pgTable(
  "user_responsibility_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    roleKey: text("role_key"),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    // TENANCY (0149 add/backfill via project/villa/user; 0155 NOT NULL
    // cutover). Inserts use requireOrgId().
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskCategory: text("task_category"),
    scopeType: text("scope_type").notNull().default("operations"),
    status: text("status").notNull().default("active"),
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
    index("user_responsibility_scopes_user_idx").on(t.userId),
    index("user_responsibility_scopes_villa_idx").on(t.villaId),
    index("user_responsibility_scopes_project_idx").on(t.projectId),
    index("user_responsibility_scopes_scope_idx").on(t.scopeType, t.status),
    index("user_responsibility_scopes_organization_idx").on(t.organizationId),
  ],
);

/**
 * V9A — registry-only. Stores camera metadata and an external vendor
 * URL. The application NEVER streams video and NEVER stores plaintext
 * stream credentials in `stream_url_encrypted` — that column is a
 * placeholder for a future encrypted-credential flow gated by
 * security.manage.
 */
export const securityCameraDevices = pgTable(
  "security_camera_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    // TENANCY (0149 add/backfill via villa/project; 0155 NOT NULL cutover).
    // Inserts use requireOrgId().
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    locationLabel: text("location_label").notNull(),
    provider: text("provider"),
    externalAppUrl: text("external_app_url"),
    streamUrlEncrypted: text("stream_url_encrypted"),
    status: text("status").notNull().default("active"),
    accessRole: text("access_role"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("security_camera_devices_villa_idx").on(t.villaId),
    index("security_camera_devices_project_idx").on(t.projectId),
    index("security_camera_devices_status_idx").on(t.status),
    index("security_camera_devices_organization_idx").on(t.organizationId),
  ],
);

export type VillaCalendarBlock = typeof villaCalendarBlocks.$inferSelect;
export type NewVillaCalendarBlock = typeof villaCalendarBlocks.$inferInsert;
export type VillaReadinessState = typeof villaReadinessStates.$inferSelect;
export type NewVillaReadinessState = typeof villaReadinessStates.$inferInsert;
export type BookingStayEvent = typeof bookingStayEvents.$inferSelect;
export type NewBookingStayEvent = typeof bookingStayEvents.$inferInsert;
export type CheckinCheckoutRequest = typeof checkinCheckoutRequests.$inferSelect;
export type NewCheckinCheckoutRequest =
  typeof checkinCheckoutRequests.$inferInsert;
export type UserResponsibilityScope =
  typeof userResponsibilityScopes.$inferSelect;
export type NewUserResponsibilityScope =
  typeof userResponsibilityScopes.$inferInsert;
export type SecurityCameraDevice = typeof securityCameraDevices.$inferSelect;
export type NewSecurityCameraDevice = typeof securityCameraDevices.$inferInsert;
