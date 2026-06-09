/**
 * Keystone first-run org setup (migration 0128).
 *
 *   onboarding_progress   — one row per org; the 3-step setup wizard's
 *                           saved progress (current step + dismissed flag).
 *   roleAccessOverrides   — per (org, cabinet, role) override of the
 *                           hardcoded ROLE_CAPABILITIES "*.read" matrix that
 *                           backs the "who-sees-what" matrix editor.
 */

import {
  pgTable,
  uuid,
  integer,
  boolean,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";

export const onboardingProgress = pgTable("onboarding_progress", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** 0 = welcome not started, 1 = villas, 2 = projects, 3 = team. */
  currentStep: integer("current_step").notNull().default(0),
  dismissed: boolean("dismissed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type NewOnboardingProgress = typeof onboardingProgress.$inferInsert;

export const roleAccessOverrides = pgTable(
  "role_access_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** cabinet prefix, e.g. 'finance', 'operations', 'bookings'. */
    cabinet: text("cabinet").notNull(),
    /** canonical RoleKey, e.g. 'director', 'finance_manager'. */
    roleKey: text("role_key").notNull(),
    canAccess: boolean("can_access").notNull(),
    updatedBy: uuid("updated_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("role_access_overrides_org_cabinet_role_uniq").on(
      t.organizationId,
      t.cabinet,
      t.roleKey,
    ),
    index("role_access_overrides_org_idx").on(t.organizationId),
  ],
);

export type RoleAccessOverride = typeof roleAccessOverrides.$inferSelect;
export type NewRoleAccessOverride = typeof roleAccessOverrides.$inferInsert;
