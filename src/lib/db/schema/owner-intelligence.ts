import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  date,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { bookings, guests } from "./bookings";
import { owners } from "./ownership";
import { organizations } from "./saas";

/**
 * Prompt 101 — Owner Calendar & Villa Health Reports.
 *
 * These four tables back the new owner intelligence portal. They
 * are reporting layers; the canonical sources (`bookings`,
 * `operation_tasks`, `maintenance_tickets`, `revenue_lines`,
 * `expense_lines`, `owner_stay_requests`, …) stay where they are.
 *
 * Owners read only owner-safe projections through the services
 * layer; RLS additionally enforces ownership-share scoping at the DB
 * line.
 */

export const guestReviews = pgTable(
  "guest_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa → project.organization_id (else project_id). Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    source: text("source").notNull(),
    externalReviewId: text("external_review_id"),
    reviewerDisplayName: text("reviewer_display_name"),
    reviewerCountry: text("reviewer_country"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    cleanlinessRating: numeric("cleanliness_rating", {
      precision: 3,
      scale: 2,
    }),
    communicationRating: numeric("communication_rating", {
      precision: 3,
      scale: 2,
    }),
    locationRating: numeric("location_rating", {
      precision: 3,
      scale: 2,
    }),
    valueRating: numeric("value_rating", { precision: 3, scale: 2 }),
    text: text("text"),
    responseText: text("response_text"),
    reviewDate: date("review_date"),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    publicVisible: boolean("public_visible").notNull().default(false),
    status: text("status").notNull().default("published"),
    sentiment: text("sentiment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_reviews_villa_review_date_idx").on(
      t.villaId,
      sql`${t.reviewDate} DESC`,
    ),
    index("guest_reviews_booking_idx").on(t.bookingId),
    index("guest_reviews_owner_visible_idx").on(t.ownerVisible),
    index("guest_reviews_status_idx").on(t.status),
    index("guest_reviews_organization_idx").on(t.organizationId),
  ],
);

export const ownerCalendarPreferences = pgTable(
  "owner_calendar_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  owner → ownership_shares → project.organization_id. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    defaultCurrency: text("default_currency").notNull().default("USD"),
    showGuestNames: boolean("show_guest_names").notNull().default(true),
    showGuestCountry: boolean("show_guest_country")
      .notNull()
      .default(true),
    showChannelLabels: boolean("show_channel_labels")
      .notNull()
      .default(true),
    showMaintenanceDetails: boolean("show_maintenance_details")
      .notNull()
      .default(true),
    calendarDensity: text("calendar_density")
      .notNull()
      .default("comfortable"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("owner_calendar_preferences_owner_unique").on(t.ownerId),
    index("owner_calendar_preferences_organization_idx").on(t.organizationId),
  ],
);

export const villaHealthSnapshots = pgTable(
  "villa_health_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa → project.organization_id (else project_id). Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    occupancyRate: numeric("occupancy_rate", {
      precision: 6,
      scale: 4,
    }),
    bookedNights: integer("booked_nights").notNull().default(0),
    ownerStayNights: integer("owner_stay_nights").notNull().default(0),
    maintenanceBlockedNights: integer("maintenance_blocked_nights")
      .notNull()
      .default(0),
    housekeepingTasksCompleted: integer("housekeeping_tasks_completed")
      .notNull()
      .default(0),
    maintenanceTicketsOpen: integer("maintenance_tickets_open")
      .notNull()
      .default(0),
    maintenanceTicketsCompleted: integer("maintenance_tickets_completed")
      .notNull()
      .default(0),
    preventiveTasksDue: integer("preventive_tasks_due")
      .notNull()
      .default(0),
    utilityRiskCount: integer("utility_risk_count").notNull().default(0),
    averageReviewRating: numeric("average_review_rating", {
      precision: 3,
      scale: 2,
    }),
    negativeReviewCount: integer("negative_review_count")
      .notNull()
      .default(0),
    reserveBalanceMinor: bigint("reserve_balance_minor", { mode: "bigint" }),
    reserveCurrency: text("reserve_currency"),
    healthScore: numeric("health_score", { precision: 5, scale: 2 }),
    healthStatus: text("health_status").notNull().default("unknown"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("villa_health_snapshots_villa_period_unique").on(
      t.villaId,
      t.periodStart,
      t.periodEnd,
    ),
    index("villa_health_snapshots_project_idx").on(t.projectId),
    index("villa_health_snapshots_status_idx").on(t.healthStatus),
    index("villa_health_snapshots_generated_idx").on(
      sql`${t.generatedAt} DESC`,
    ),
    index("villa_health_snapshots_organization_idx").on(t.organizationId),
  ],
);

export const ownerVisibleEvents = pgTable(
  "owner_visible_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa → project.organization_id (else project_id, else owner share).
     *  Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    eventDate: date("event_date").notNull(),
    eventEndDate: date("event_end_date"),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity").notNull().default("info"),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_visible_events_owner_date_idx").on(
      t.ownerId,
      sql`${t.eventDate} DESC`,
    ),
    index("owner_visible_events_villa_date_idx").on(
      t.villaId,
      sql`${t.eventDate} DESC`,
    ),
    index("owner_visible_events_source_idx").on(t.sourceType, t.sourceId),
    index("owner_visible_events_severity_idx").on(t.severity),
    index("owner_visible_events_organization_idx").on(t.organizationId),
  ],
);

export type GuestReview = typeof guestReviews.$inferSelect;
export type NewGuestReview = typeof guestReviews.$inferInsert;
export type OwnerCalendarPreference =
  typeof ownerCalendarPreferences.$inferSelect;
export type NewOwnerCalendarPreference =
  typeof ownerCalendarPreferences.$inferInsert;
export type VillaHealthSnapshot = typeof villaHealthSnapshots.$inferSelect;
export type NewVillaHealthSnapshot =
  typeof villaHealthSnapshots.$inferInsert;
export type OwnerVisibleEvent = typeof ownerVisibleEvents.$inferSelect;
export type NewOwnerVisibleEvent = typeof ownerVisibleEvents.$inferInsert;
