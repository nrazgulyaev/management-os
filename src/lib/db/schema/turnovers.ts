import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { villas } from "./projects";
import { bookings } from "./bookings";
import { appUsers } from "./identity";

/**
 * W4 mgmt-04 — Housekeeping turnovers.
 *
 * One row per villa per day that needs a turnover (a same-day
 * checkout → check-in, or a manually-created clean). The
 * /dashboard/operations/turnovers kanban reads + writes these rows;
 * the turnover-allocator agent fills empty `assigneeUserId` slots by
 * cleaner workload.
 *
 * Single-tenant pattern: mirrors `villas`/`bookings`, which carry no
 * `organization_id` (see operations-cabinet-queries.ts). Scope is the
 * villa/booking graph, not an org column.
 *
 * No money columns — turnovers are operational, not financial.
 */

/** Allowed kanban statuses. Mirrors TurnoverBoard's `TurnoverStatus`. */
export const TURNOVER_STATUSES = [
  "todo",
  "in-progress",
  "inspection",
  "done",
] as const;
export type TurnoverStatus = (typeof TURNOVER_STATUSES)[number];

export const turnovers = pgTable(
  "turnovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    turnoverDate: date("turnover_date").notNull(),
    // status: todo | in-progress | inspection | done
    status: text("status").notNull().default("todo"),
    assigneeUserId: uuid("assignee_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Booking that checks OUT on `turnover_date` (the clean trigger). */
    sourceBookingId: uuid("source_booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    /** Booking that checks IN on `turnover_date` (the deadline), if any. */
    nextBookingId: uuid("next_booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    /** Optional priority hint surfaced as a board badge ("Late", "Deep clean"). */
    badge: text("badge"),
    /** One-line rationale written by the turnover-allocator agent. */
    assignmentRationale: text("assignment_rationale"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One turnover row per villa per day — lets the read-side derive
    // missing rows idempotently via ON CONFLICT DO NOTHING.
    unique("turnovers_villa_date_uniq").on(t.villaId, t.turnoverDate),
    index("turnovers_date_idx").on(t.turnoverDate),
    index("turnovers_status_idx").on(t.status),
    index("turnovers_assignee_idx").on(t.assigneeUserId),
    index("turnovers_villa_idx").on(t.villaId),
  ],
);

export type Turnover = typeof turnovers.$inferSelect;
export type NewTurnover = typeof turnovers.$inferInsert;
