import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  date,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { bookings } from "./bookings";
import { owners } from "./ownership";
import { ownerStatements, statementLines } from "./finance";
import {
  directBookingHolds,
  directBookingRequests,
} from "./direct-booking";

/**
 * Prompt 108 — Direct Booking Owner Portal Surface + Owner Revenue
 * Transparency.
 *
 * Three owner-safe projection tables.  These are reporting layers; the
 * canonical sources (`bookings`, `direct_booking_*`, `revenue_lines`,
 * `statement_lines`, `owner_stay_requests`, …) stay where they are.
 *
 * Owners only ever read these projections — never the raw direct-booking
 * tables — so the redaction contract is enforced once, in
 * `src/features/owner-bookings/projection.ts`, and the rest of the owner
 * portal is a thin renderer.
 */

export const ownerBookingSummaries = pgTable(
  "owner_booking_summaries",
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
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    directBookingRequestId: uuid("direct_booking_request_id").references(
      () => directBookingRequests.id,
      { onDelete: "set null" },
    ),
    directBookingHoldId: uuid("direct_booking_hold_id").references(
      () => directBookingHolds.id,
      { onDelete: "set null" },
    ),
    sourceType: text("source_type").notNull(),
    publicStatus: text("public_status").notNull(),
    ownerLabel: text("owner_label").notNull(),
    guestLabel: text("guest_label"),
    guestCountry: text("guest_country"),
    channelLabel: text("channel_label"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    guestCount: integer("guest_count"),
    totalAmountMinor: bigint("total_amount_minor", { mode: "bigint" }),
    ownerRevenueMinor: bigint("owner_revenue_minor", { mode: "bigint" }),
    currency: text("currency"),
    revenuePosted: boolean("revenue_posted").notNull().default(false),
    statementId: uuid("statement_id").references(() => ownerStatements.id, {
      onDelete: "set null",
    }),
    statementLineId: uuid("statement_line_id").references(
      () => statementLines.id,
      { onDelete: "set null" },
    ),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    visibilityNotes: text("visibility_notes"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_booking_summaries_owner_check_in_idx").on(
      t.ownerId,
      sql`${t.checkIn} DESC`,
    ),
    index("owner_booking_summaries_villa_check_in_idx").on(
      t.villaId,
      sql`${t.checkIn} DESC`,
    ),
    index("owner_booking_summaries_booking_idx").on(t.bookingId),
    index("owner_booking_summaries_request_idx").on(t.directBookingRequestId),
    index("owner_booking_summaries_statement_idx").on(t.statementId),
    index("owner_booking_summaries_source_idx").on(t.sourceType),
    index("owner_booking_summaries_status_idx").on(t.publicStatus),
  ],
);

export const ownerBookingRevenueBreakdowns = pgTable(
  "owner_booking_revenue_breakdowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerBookingSummaryId: uuid("owner_booking_summary_id")
      .notNull()
      .references(() => ownerBookingSummaries.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    directBookingRequestId: uuid("direct_booking_request_id").references(
      () => directBookingRequests.id,
      { onDelete: "set null" },
    ),
    category: text("category").notNull(),
    label: text("label").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    direction: text("direction").notNull(),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_booking_revenue_breakdowns_summary_sort_idx").on(
      t.ownerBookingSummaryId,
      t.sortOrder,
    ),
    index("owner_booking_revenue_breakdowns_owner_idx").on(t.ownerId),
    index("owner_booking_revenue_breakdowns_villa_idx").on(t.villaId),
    index("owner_booking_revenue_breakdowns_booking_idx").on(t.bookingId),
    index("owner_booking_revenue_breakdowns_request_idx").on(
      t.directBookingRequestId,
    ),
  ],
);

export const ownerRevenueSourceMonthly = pgTable(
  "owner_revenue_source_monthly",
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
    periodMonth: date("period_month").notNull(),
    sourceType: text("source_type").notNull(),
    grossRevenueMinor: bigint("gross_revenue_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    deductionsMinor: bigint("deductions_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    netOwnerEffectMinor: bigint("net_owner_effect_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    bookingCount: integer("booking_count").notNull().default(0),
    occupiedNights: integer("occupied_nights").notNull().default(0),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_revenue_source_monthly_owner_period_idx").on(
      t.ownerId,
      sql`${t.periodMonth} DESC`,
    ),
    index("owner_revenue_source_monthly_villa_period_idx").on(
      t.villaId,
      sql`${t.periodMonth} DESC`,
    ),
    index("owner_revenue_source_monthly_source_idx").on(t.sourceType),
  ],
);

export type OwnerBookingSummary = typeof ownerBookingSummaries.$inferSelect;
export type NewOwnerBookingSummary = typeof ownerBookingSummaries.$inferInsert;
export type OwnerBookingRevenueBreakdown =
  typeof ownerBookingRevenueBreakdowns.$inferSelect;
export type NewOwnerBookingRevenueBreakdown =
  typeof ownerBookingRevenueBreakdowns.$inferInsert;
export type OwnerRevenueSourceMonthlyRow =
  typeof ownerRevenueSourceMonthly.$inferSelect;
export type NewOwnerRevenueSourceMonthlyRow =
  typeof ownerRevenueSourceMonthly.$inferInsert;
