/**
 * Stage 5.B.1 — Revenue streams from non-saleable assets.
 *
 * `net_revenue_minor` is `GENERATED STORED` in the DB
 * = `gross_revenue_minor - direct_costs_minor`.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { villas, projects } from "./projects";
import { appUsers } from "./identity";

export const revenueStreams = pgTable(
  "revenue_streams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** References villas (the multi-asset table) — see arch doc. */
    assetId: uuid("asset_id")
      .notNull()
      .references(() => villas.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    /**
     * 'hotel_room_revenue' | 'restaurant_revenue' | 'spa_revenue'
     * | 'rental_income' | 'service_fee' | 'membership_fee'
     * | 'event_revenue' | 'other'
     */
    streamType: text("stream_type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    grossRevenueMinor: bigint("gross_revenue_minor", {
      mode: "bigint",
    }).notNull(),
    occupancyRate: numeric("occupancy_rate", { precision: 5, scale: 2 }),
    averageDailyRateMinor: bigint("average_daily_rate_minor", {
      mode: "bigint",
    }),
    unitsSold: integer("units_sold"),
    currency: text("currency").notNull().default("IDR"),
    directCostsMinor: bigint("direct_costs_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    /** GENERATED STORED in DB. */
    netRevenueMinor: bigint("net_revenue_minor", { mode: "bigint" }),
    dataSource: text("data_source"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    assetIdx: index("revenue_streams_asset_idx").on(t.assetId),
    projectIdx: index("revenue_streams_project_idx").on(t.projectId),
    periodIdx: index("revenue_streams_period_idx").on(t.periodStart, t.periodEnd),
    typeIdx: index("revenue_streams_type_idx").on(t.streamType),
  }),
);

export type RevenueStream = typeof revenueStreams.$inferSelect;
export type NewRevenueStream = typeof revenueStreams.$inferInsert;
