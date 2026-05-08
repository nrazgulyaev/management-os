import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  primaryKey,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Application user record. Mirrors `auth.users(id)` when Supabase Auth is in
 * use; `auth_user_id` is nullable so we can pre-create staff/owner records
 * before the first sign-in and link them on auth callback.
 */
export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id").unique(),
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    /** Stage 3.D — WhatsApp routing. */
    whatsappPhone: text("whatsapp_phone"),
    prefersWhatsapp: boolean("prefers_whatsapp").notNull().default(false),
    avatarUrl: text("avatar_url"),
    status: text("status").notNull().default("active"), // active | invited | suspended | archived
    /** v8B — IANA timezone for quiet-hours evaluation. Defaults to the
     *  Arconique HQ timezone; operators / staff can override per user. */
    timezone: text("timezone").notNull().default("Asia/Makassar"),
    /**
     * Stage 5.J — multi-tenant boundary. Every app_user belongs to
     * exactly one org. NOT NULL with FK to organizations(id) added by
     * migration 0071; pre-Stage-5.J rows backfilled to
     * `ARCONIQUE_DEFAULT`.
     *
     * Earlier sessions had a Drizzle schema that omitted this column
     * while the deployed DB had it NOT NULL — that drift caused
     * migration 0087 (provisioning backfill) to fail repeatedly with a
     * NOT NULL violation. The TS column is added here so application
     * INSERTs match the deployed constraint.
     *
     * The FK target is enforced by the migration; we don't repeat the
     * `.references(() => organizations.id)` here to avoid a circular
     * import (organizations → app_users via owner FKs in saas.ts).
     */
    organizationId: uuid("organization_id").notNull(),
    /**
     * Stage 2.3.C — links an auth user to an investor record. Set ONLY for
     * users with the `investor_viewer` role; null for internal staff. The
     * `protect_app_users_investor_id_trg` trigger blocks non-internal
     * UPDATEs to this column.
     */
    investorId: uuid("investor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("app_users_email_lower_idx").on(sql`lower(${t.email})`),
    index("app_users_organization_idx").on(t.organizationId),
    index("app_users_investor_idx").on(t.investorId),
  ],
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    // Surrogate id — see drizzle/0004_bootstrap_user_roles_fix.sql for the
    // rationale (composite PK forced scope_type/scope_id NOT NULL, breaking
    // global-scope grants like the bootstrap super_admin link).
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    scopeType: text("scope_type"), // null | 'project' | 'villa' | 'owner'
    scopeId: uuid("scope_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("user_roles_user_role_scope_uniq").on(
      t.userId,
      t.roleId,
      t.scopeType,
      t.scopeId,
    ).nullsNotDistinct(),
    index("user_roles_user_idx").on(t.userId),
    index("user_roles_scope_idx").on(t.scopeType, t.scopeId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export type AppUser = typeof appUsers.$inferSelect;
export type NewAppUser = typeof appUsers.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
