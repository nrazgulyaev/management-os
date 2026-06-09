/**
 * OWNER-ENGAGEMENT (#168 follow-up · migration 0143) — owner_guest_preapprovals.
 *
 * A structured "pre-approved guest" record. The owner authorises a friend /
 * family member to be hosted at one of their villas for a window, with no paid
 * booking. Mgmt reviews → approves / declines; the owner sees the status on
 * the home + inbox. NOT a `bookings` row — there is no rate, charge, or
 * settlement; it is a courtesy authorisation mgmt converts into an
 * operational hold once the guest actually books dates.
 *
 * Owner-scoped (owner_id FK → owners, cascade). No money columns.
 */

import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { owners } from "./ownership";

export type GuestPreapprovalStatus =
  | "requested"
  | "approved"
  | "declined"
  | "cancelled"
  | "converted";

export const ownerGuestPreapprovals = pgTable(
  "owner_guest_preapprovals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** One of the owner's villas — ownership enforced in the action. */
    villaId: uuid("villa_id").notNull(),
    guestName: text("guest_name").notNull(),
    guestRelationship: text("guest_relationship"),
    partySize: integer("party_size").notNull().default(1),
    arriveOn: date("arrive_on").notNull(),
    departOn: date("depart_on").notNull(),
    notes: text("notes"),
    /** Enum: requested | approved | declined | cancelled | converted. */
    status: text("status").notNull().default("requested"),
    /** Soft link to the owner_threads conversation opened for this pre-approval. */
    threadId: uuid("thread_id"),
    decidedByAppUserId: uuid("decided_by_app_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdByAppUserId: uuid("created_by_app_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("owner_guest_preapprovals_owner_created_idx").on(t.ownerId, t.createdAt),
    index("owner_guest_preapprovals_owner_status_idx").on(t.ownerId, t.status),
    index("owner_guest_preapprovals_villa_arrive_idx").on(t.villaId, t.arriveOn),
  ],
);

export type OwnerGuestPreapproval = typeof ownerGuestPreapprovals.$inferSelect;
export type NewOwnerGuestPreapproval = typeof ownerGuestPreapprovals.$inferInsert;
