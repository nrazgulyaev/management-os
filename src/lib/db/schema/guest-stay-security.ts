import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { guestStayTokens } from "./guest-stays";
import { bookings } from "./bookings";

/**
 * V9G — guest stay security primitives.
 *
 *   - `wifi_encryption_keys` — versioned data-keys for AES-256-GCM
 *     Wi-Fi password encryption. The platform secret in env wraps the
 *     data key; rotation flips `status='rotated'` and inserts a new
 *     active row.
 *   - `guest_stay_token_verifications` — one-time codes that gate first
 *     access. SHA-256 hash only; raw code never persisted.
 *   - `guest_stay_security_events` — append-only security log,
 *     separate from the high-volume access log. Severity-aware so we
 *     can surface only the noisy stuff to operators.
 *   - `guest_stay_rate_limits` — per (token-prefix, ip_hash) rolling
 *     counter for both general access and verification attempts.
 */
export const wifiEncryptionKeys = pgTable(
  "wifi_encryption_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyVersion: integer("key_version").notNull().unique(),
    encryptedDataKey: text("encrypted_data_key").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (t) => [index("wifi_encryption_keys_status_idx").on(t.status)],
);

export const guestStayTokenVerifications = pgTable(
  "guest_stay_token_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestStayTokenId: uuid("guest_stay_token_id")
      .notNull()
      .references(() => guestStayTokens.id, { onDelete: "cascade" }),
    verificationCodeHash: text("verification_code_hash").notNull(),
    channel: text("channel").notNull(),
    recipientMasked: text("recipient_masked"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_stay_token_verifications_pending_unique")
      .on(t.guestStayTokenId)
      .where(sql`${t.status} = 'pending'`),
    index("guest_stay_token_verifications_token_idx").on(t.guestStayTokenId),
    index("guest_stay_token_verifications_status_idx").on(t.status),
    index("guest_stay_token_verifications_expires_idx").on(t.expiresAt),
  ],
);

export const guestStaySecurityEvents = pgTable(
  "guest_stay_security_events",
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
    severity: text("severity").notNull().default("low"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_stay_security_events_token_idx").on(t.guestStayTokenId),
    index("guest_stay_security_events_booking_idx").on(t.bookingId),
    index("guest_stay_security_events_type_idx").on(t.eventType),
    index("guest_stay_security_events_severity_idx").on(t.severity),
    index("guest_stay_security_events_created_idx").on(
      sql`${t.createdAt} DESC`,
    ),
  ],
);

export const guestStayRateLimits = pgTable(
  "guest_stay_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenPrefix: text("token_prefix").notNull(),
    ipHash: text("ip_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_stay_rate_limits_unique").on(t.tokenPrefix, t.ipHash),
    index("guest_stay_rate_limits_blocked_idx").on(t.blockedUntil),
  ],
);

export type WifiEncryptionKey = typeof wifiEncryptionKeys.$inferSelect;
export type NewWifiEncryptionKey = typeof wifiEncryptionKeys.$inferInsert;
export type GuestStayTokenVerification =
  typeof guestStayTokenVerifications.$inferSelect;
export type NewGuestStayTokenVerification =
  typeof guestStayTokenVerifications.$inferInsert;
export type GuestStaySecurityEvent =
  typeof guestStaySecurityEvents.$inferSelect;
export type NewGuestStaySecurityEvent =
  typeof guestStaySecurityEvents.$inferInsert;
export type GuestStayRateLimit = typeof guestStayRateLimits.$inferSelect;
export type NewGuestStayRateLimit = typeof guestStayRateLimits.$inferInsert;
