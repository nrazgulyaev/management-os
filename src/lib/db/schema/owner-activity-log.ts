/**
 * Packet C PR 1 (owner-data-l2) — owner_activity_log.
 *
 * Append-only event stream surfaced on the Owner Portal Home
 * "recent activity" section. Different from `auditEvents` — this
 * is owner-facing, narrative-style, with display-ready fields.
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { owners } from "./ownership";

export type OwnerActivityKind =
  | "statement_issued"
  | "statement_paid"
  | "booking_confirmed"
  | "maintenance_closed"
  | "personal_stay_confirmed"
  | "document_uploaded"
  | "message_received"
  | "q_review_scheduled"
  | "tax_doc_ready"
  | "other";

export const ownerActivityLog = pgTable(
  "owner_activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** Enum: see OwnerActivityKind above. */
    kind: text("kind").notNull(),
    /** Soft reference. */
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    /** Display title. */
    subject: text("subject").notNull(),
    /** Optional one-line body for richer entries. */
    body: text("body"),
    /** Owner-portal route to drill into. */
    linkUrl: text("link_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    readByOwnerAt: timestamp("read_by_owner_at", { withTimezone: true }),
  },
  (t) => [
    index("owner_activity_log_owner_occurred_idx").on(t.ownerId, t.occurredAt),
    index("owner_activity_log_owner_read_idx").on(t.ownerId, t.readByOwnerAt),
  ],
);

export type OwnerActivity = typeof ownerActivityLog.$inferSelect;
export type NewOwnerActivity = typeof ownerActivityLog.$inferInsert;
