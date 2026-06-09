import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { owners } from "./ownership";
import { organizations } from "./saas";

/**
 * Explicit grant linking a Supabase Auth user (via `app_users`) to an
 * `owners` entity. Replaces the v3 email-match heuristic with auditable,
 * revocable access.
 *
 * One active grant per (app_user_id, owner_id, grant_type) is enforced by a
 * partial unique index in migration 0003.
 */
export const appUsersOwners = pgTable(
  "app_users_owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  app_user → app_users.organization_id. Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    grantType: text("grant_type").notNull().default("owner_portal"),
    status: text("status").notNull().default("active"),
    grantedBy: uuid("granted_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid("revoked_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("app_users_owners_app_user_idx").on(t.appUserId),
    index("app_users_owners_owner_idx").on(t.ownerId),
    index("app_users_owners_status_idx").on(t.status),
    index("app_users_owners_organization_idx").on(t.organizationId),
  ],
);

export type AppUserOwnerGrant = typeof appUsersOwners.$inferSelect;
export type NewAppUserOwnerGrant = typeof appUsersOwners.$inferInsert;

// =============================================================================
// AUTH-INVESTOR-1 — investor portal access grants (mirrors app_users_owners).
// =============================================================================

import { investors } from "./investor-capital";

export const appUsersInvestors = pgTable(
  "app_users_investors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  investor → investors.organization_id. Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    grantType: text("grant_type").notNull().default("investor_portal"),
    status: text("status").notNull().default("active"),
    grantedBy: uuid("granted_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid("revoked_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("app_users_investors_app_user_idx").on(t.appUserId),
    index("app_users_investors_investor_idx").on(t.investorId),
    index("app_users_investors_status_idx").on(t.status),
    index("app_users_investors_organization_idx").on(t.organizationId),
  ],
);

export type AppUserInvestorGrant = typeof appUsersInvestors.$inferSelect;
export type NewAppUserInvestorGrant = typeof appUsersInvestors.$inferInsert;
