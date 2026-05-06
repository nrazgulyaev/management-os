import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { bookings } from "./bookings";
import { revenueLines, statementPeriods } from "./finance";
import {
  directBookingHolds,
  directBookingRequests,
} from "./direct-booking";
import { directBookingDeposits } from "./payments";

/**
 * Prompt 107 — Direct Booking Finance Reconciliation.
 *
 * One row per converted direct-booking request. The link is the
 * idempotency anchor: a `revenue_lines` row is only inserted when no
 * existing `posted` link exists for the request. Statement-period
 * lock checks happen at insert time and yield a
 * `skipped_locked_period` link with no revenue row.
 */

export const directBookingFinanceLinks = pgTable(
  "direct_booking_finance_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").references(() => directBookingRequests.id, {
      onDelete: "cascade",
    }),
    holdId: uuid("hold_id").references(() => directBookingHolds.id, {
      onDelete: "set null",
    }),
    depositId: uuid("deposit_id").references(() => directBookingDeposits.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    revenueLineId: uuid("revenue_line_id").references(
      () => revenueLines.id,
      { onDelete: "set null" },
    ),
    statementPeriodId: uuid("statement_period_id").references(
      () => statementPeriods.id,
      { onDelete: "set null" },
    ),
    linkCode: text("link_code").notNull().unique(),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    depositAmountMinor: bigint("deposit_amount_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    balanceDueMinor: bigint("balance_due_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("pending"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    error: text("error"),
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
    uniqueIndex("direct_booking_finance_links_request_unique").on(t.requestId),
    uniqueIndex("direct_booking_finance_links_booking_unique")
      .on(t.bookingId)
      .where(sql`${t.bookingId} IS NOT NULL`),
    uniqueIndex("direct_booking_finance_links_revenue_unique")
      .on(t.revenueLineId)
      .where(sql`${t.revenueLineId} IS NOT NULL`),
    index("direct_booking_finance_links_status_idx").on(t.status),
    index("direct_booking_finance_links_statement_idx").on(t.statementPeriodId),
    index("direct_booking_finance_links_posted_idx").on(
      sql`${t.postedAt} DESC`,
    ),
  ],
);

export type DirectBookingFinanceLink =
  typeof directBookingFinanceLinks.$inferSelect;
export type NewDirectBookingFinanceLink =
  typeof directBookingFinanceLinks.$inferInsert;
