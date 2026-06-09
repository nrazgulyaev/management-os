import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { villas } from "./projects";
import { appUsers } from "./identity";

/**
 * P1 owner-calendar-pool (migration 0131) — Villa rental-pool state.
 *
 * One row per villa, tracking whether the owner keeps the villa IN the
 * rental pool (bookable by guests) or has TAKEN IT OUT for personal use.
 * Toggling enters a 14-day cooling-off window (`coolingOffUntil`) during
 * which `pendingStatus` is the target state; once the window elapses the
 * read-side treats `poolStatus` as effective.
 *
 * Single-tenant pattern: mirrors `villas`/`bookings` (no
 * `organization_id`). Scope flows through villa → ownership_shares.
 *
 * No money columns — the financial side (Pay-&-book vs Book-free) reuses
 * the existing owner_stay_requests pipeline, not this table.
 */

/** Allowed pool states. */
export const POOL_STATUSES = ["in_pool", "out_of_pool"] as const;
export type PoolStatus = (typeof POOL_STATUSES)[number];

/** Cooling-off window for a pool toggle, in days. */
export const POOL_COOLING_OFF_DAYS = 14;

export const villaPoolState = pgTable(
  "villa_pool_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    /** in_pool | out_of_pool — the effective state once cooling-off elapses. */
    poolStatus: text("pool_status").notNull().default("in_pool"),
    /** The app_user (owner-portal grant) that last toggled the state. */
    changedByAppUserId: uuid("changed_by_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    /** When the most recent take-out / return request was made. */
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    /**
     * 14-day cooling-off boundary: the pending status becomes effective at
     * this instant. NULL once the cooling-off has elapsed (state is stable).
     */
    coolingOffUntil: timestamp("cooling_off_until", { withTimezone: true }),
    /**
     * The status the villa is transitioning TO during cooling-off. NULL
     * when no transition is pending.
     */
    pendingStatus: text("pending_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("villa_pool_state_villa_uniq").on(t.villaId),
    index("villa_pool_state_status_idx").on(t.poolStatus),
    index("villa_pool_state_cooling_idx").on(t.coolingOffUntil),
  ],
);

export type VillaPoolState = typeof villaPoolState.$inferSelect;
export type NewVillaPoolState = typeof villaPoolState.$inferInsert;
