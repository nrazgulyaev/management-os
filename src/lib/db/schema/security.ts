import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";

/**
 * Prompt 111 — Security baseline & operational hardening.
 *
 * Five tables that back MFA enrolment + verification, login throttling,
 * security-event logging, and cron job mutual exclusion.  All tables
 * are RLS-forced internal-only — there is no public surface.
 */

export const authMfaFactors = pgTable(
  "auth_mfa_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    factorType: text("factor_type").notNull().default("totp"),
    status: text("status").notNull().default("pending"),
    issuer: text("issuer").notNull().default("Arconique"),
    label: text("label"),
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretKeyVersion: integer("secret_key_version").notNull().default(1),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auth_mfa_factors_user_idx").on(t.appUserId),
    index("auth_mfa_factors_status_idx").on(t.status),
    uniqueIndex("auth_mfa_factors_active_unique")
      .on(t.appUserId)
      .where(
        sql`${t.factorType} = 'totp' AND ${t.status} IN ('pending', 'verified')`,
      ),
  ],
);

export const authMfaRecoveryCodes = pgTable(
  "auth_mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    status: text("status").notNull().default("active"),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("auth_mfa_recovery_codes_user_idx").on(t.appUserId)],
);

export const authLoginAttempts = pgTable(
  "auth_login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailNormalized: text("email_normalized"),
    appUserId: uuid("app_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    succeeded: boolean("succeeded").notNull().default(false),
    failureReason: text("failure_reason"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auth_login_attempts_email_idx").on(
      t.emailNormalized,
      sql`${t.createdAt} DESC`,
    ),
    index("auth_login_attempts_ip_idx").on(
      t.ipHash,
      sql`${t.createdAt} DESC`,
    ),
    index("auth_login_attempts_user_idx").on(
      t.appUserId,
      sql`${t.createdAt} DESC`,
    ),
  ],
);

export const authSecurityEvents = pgTable(
  "auth_security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appUserId: uuid("app_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull().default("info"),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auth_security_events_user_idx").on(
      t.appUserId,
      sql`${t.createdAt} DESC`,
    ),
    index("auth_security_events_type_idx").on(
      t.eventType,
      sql`${t.createdAt} DESC`,
    ),
    index("auth_security_events_severity_idx").on(
      t.severity,
      sql`${t.createdAt} DESC`,
    ),
  ],
);

export const jobLocks = pgTable(
  "job_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobKey: text("job_key").notNull().unique(),
    status: text("status").notNull().default("locked"),
    lockedBy: text("locked_by").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("job_locks_status_idx").on(t.status),
    index("job_locks_expires_idx").on(t.expiresAt),
  ],
);

export type AuthMfaFactor = typeof authMfaFactors.$inferSelect;
export type NewAuthMfaFactor = typeof authMfaFactors.$inferInsert;
export type AuthMfaRecoveryCode = typeof authMfaRecoveryCodes.$inferSelect;
export type NewAuthMfaRecoveryCode = typeof authMfaRecoveryCodes.$inferInsert;
export type AuthLoginAttempt = typeof authLoginAttempts.$inferSelect;
export type NewAuthLoginAttempt = typeof authLoginAttempts.$inferInsert;
export type AuthSecurityEvent = typeof authSecurityEvents.$inferSelect;
export type NewAuthSecurityEvent = typeof authSecurityEvents.$inferInsert;
export type JobLock = typeof jobLocks.$inferSelect;
export type NewJobLock = typeof jobLocks.$inferInsert;
