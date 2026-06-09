/**
 * Front-office check-in flow persistence (migration 0123). One row per
 * booking holds the 4-step wizard state + the door code issued at handover.
 */

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { bookings } from "./bookings";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const bookingCheckinFlow = pgTable(
  "booking_checkin_flow",
  {
    bookingId: uuid("booking_id")
      .primaryKey()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // TENANCY (0149 add/backfill via booking; 0155 NOT NULL cutover).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    currentStep: text("current_step").notNull().default("identity"),
    stepsJson: jsonb("steps_json").notNull().default({}),
    doorCode: text("door_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => appUsers.id, {
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
    index("booking_checkin_flow_organization_idx").on(t.organizationId),
  ],
);

export type BookingCheckinFlow = typeof bookingCheckinFlow.$inferSelect;
export type NewBookingCheckinFlow = typeof bookingCheckinFlow.$inferInsert;
