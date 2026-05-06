/**
 * Stage 5.F — Role-Specific Cabinets schemas.
 *
 * 2 tables:
 *   - app_user_roles      per-user role grants (10 keys, partial unique on primary)
 *   - cabinet_preferences per-user cabinet customisation
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { projects } from "./projects";

export const appUserRoles = pgTable(
  "app_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    roleKey: text("role_key").notNull(),
    scope: text("scope").notNull(),
    scopedProjectId: uuid("scoped_project_id").references(() => projects.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    grantedBy: uuid("granted_by").references(() => appUsers.id),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => appUsers.id),
    revocationReason: text("revocation_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("app_user_roles_user_idx").on(t.userId),
    index("app_user_roles_role_idx").on(t.roleKey),
  ],
);

export const cabinetPreferences = pgTable("cabinet_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  defaultCabinetKey: text("default_cabinet_key"),
  cabinetWidgetPreferences: jsonb("cabinet_widget_preferences")
    .notNull()
    .default(sql`'{}'::jsonb`),
  preferredLanguage: text("preferred_language"),
  preferredTheme: text("preferred_theme"),
  notificationPreferences: jsonb("notification_preferences")
    .notNull()
    .default(sql`'{}'::jsonb`),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppUserRole = typeof appUserRoles.$inferSelect;
export type NewAppUserRole = typeof appUserRoles.$inferInsert;
export type CabinetPreference = typeof cabinetPreferences.$inferSelect;
export type NewCabinetPreference = typeof cabinetPreferences.$inferInsert;
