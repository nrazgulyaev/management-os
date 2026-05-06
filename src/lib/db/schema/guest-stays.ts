import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bookings } from "./bookings";
import { appUsers } from "./identity";
import { villas } from "./projects";

/**
 * V9E — production guest stay primitives.
 *
 *   - `guest_stay_tokens` — one row per issued token. Stores SHA-256 hash
 *     only; prefix kept plaintext for admin display.
 *   - `guest_stay_access_events` — append-only access log.
 *   - `smart_lock_access_codes` — stub for v9E. v9F+ adds real provider
 *     integration via `code_hash` + non-`stub` source values.
 */
export const guestStayTokens = pgTable(
  "guest_stay_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    status: text("status").notNull().default("active"),
    issuedToEmail: text("issued_to_email"),
    issuedToPhone: text("issued_to_phone"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedBy: uuid("revoked_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [
    index("guest_stay_tokens_booking_idx").on(t.bookingId),
    index("guest_stay_tokens_status_idx").on(t.status),
    index("guest_stay_tokens_expires_idx").on(t.expiresAt),
  ],
);

export const guestStayAccessEvents = pgTable(
  "guest_stay_access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestStayTokenId: uuid("guest_stay_token_id").references(
      () => guestStayTokens.id,
      { onDelete: "set null" },
    ),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_stay_access_events_token_idx").on(t.guestStayTokenId),
    index("guest_stay_access_events_booking_idx").on(t.bookingId),
    index("guest_stay_access_events_type_idx").on(t.eventType),
    index("guest_stay_access_events_created_idx").on(sql`${t.createdAt} DESC`),
  ],
);

export const smartLockAccessCodes = pgTable(
  "smart_lock_access_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    codeHash: text("code_hash"),
    codeDisplay: text("code_display"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("stub"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedBy: uuid("revoked_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("smart_lock_access_codes_booking_active_unique")
      .on(t.bookingId)
      .where(sql`${t.status} = 'active'`),
    index("smart_lock_access_codes_booking_idx").on(t.bookingId),
    index("smart_lock_access_codes_villa_idx").on(t.villaId),
    index("smart_lock_access_codes_status_idx").on(t.status),
  ],
);

export type GuestStayToken = typeof guestStayTokens.$inferSelect;
export type NewGuestStayToken = typeof guestStayTokens.$inferInsert;
export type GuestStayAccessEvent = typeof guestStayAccessEvents.$inferSelect;
export type NewGuestStayAccessEvent =
  typeof guestStayAccessEvents.$inferInsert;
export type SmartLockAccessCode = typeof smartLockAccessCodes.$inferSelect;
export type NewSmartLockAccessCode = typeof smartLockAccessCodes.$inferInsert;
