import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bookings, guests } from "./bookings";
import { appUsers } from "./identity";
import { villas } from "./projects";
import { documents } from "./documents";

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

/**
 * Guest check-in lifecycle (FC-GUEST-STAY-PORTAL / FC-MANAGEMENT-FRONT-OFFICE).
 * One row per booking. The door code (smart_lock_access_codes) is only revealed
 * to the guest once status = 'code_issued' (operator approval in Front office).
 *   not_started → in_progress → submitted → approved → code_issued
 * Migration 0118.
 */
export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("not_started"),
    guestCount: integer("guest_count"),
    eta: text("eta"),
    passportUploaded: boolean("passport_uploaded").notNull().default(false),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    codeIssuedAt: timestamp("code_issued_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("checkins_booking_unique").on(t.bookingId),
    index("checkins_status_idx").on(t.status),
  ],
);

/**
 * Guest ID documents (Phase 3: passport OCR). The scan file lives in
 * `documents`; this row holds the id-ocr extraction + the human-in-the-loop
 * review status. confidence < 0.85 stays `pending_review` for manual override.
 * Migration 0119.
 */
export const guestIdDocuments = pgTable(
  "guest_id_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    docType: text("doc_type").notNull().default("passport"),
    status: text("status").notNull().default("pending_review"),
    fullName: text("full_name"),
    nationality: text("nationality"),
    documentNumber: text("document_number"),
    expiresAt: text("expires_at"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    raw: jsonb("raw"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_id_documents_booking_unique").on(t.bookingId),
    index("guest_id_documents_status_idx").on(t.status),
  ],
);

export type GuestStayToken = typeof guestStayTokens.$inferSelect;
export type NewGuestStayToken = typeof guestStayTokens.$inferInsert;
export type GuestStayAccessEvent = typeof guestStayAccessEvents.$inferSelect;
export type NewGuestStayAccessEvent =
  typeof guestStayAccessEvents.$inferInsert;
export type SmartLockAccessCode = typeof smartLockAccessCodes.$inferSelect;
export type NewSmartLockAccessCode = typeof smartLockAccessCodes.$inferInsert;
