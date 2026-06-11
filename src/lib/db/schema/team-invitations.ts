/**
 * Stage 9.D — team invitations.
 *
 * Owner-issued invites for new team members. The token + status live
 * in this table; on acceptance the runtime calls `provision_app_user`
 * (Stage 8.F.1) to create the app_users row + role grants.
 */

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { projects } from "./projects";
import { appUsers } from "./identity";
import { owners } from "./ownership";

export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** role_key matches the CHECK constraint on app_user_roles. */
    roleKey: text("role_key").notNull(),
    scope: text("scope").notNull().default("company_wide"),
    scopedProjectId: uuid("scoped_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /**
     * DOMAIN 2 (migration 0168) — owner-portal invitations. When set, this
     * invitation is an owner-portal invite: on accept the runtime creates a
     * real `app_users_owners` grant linking the new app_user to this owner.
     * NULL for ordinary staff invitations.
     */
    ownerId: uuid("owner_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    invitedByUserId: uuid("invited_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** 32-byte url-safe random; unique. */
    token: text("token").notNull().unique(),
    /** pending | accepted | revoked | expired */
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    resentCount: integer("resent_count").notNull().default(0),
    lastEmailSentAt: timestamp("last_email_sent_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("team_invitations_org_idx").on(t.organizationId),
    index("team_invitations_email_idx").on(sql`lower(${t.email})`),
    index("team_invitations_status_idx").on(t.status),
    index("team_invitations_owner_idx").on(t.ownerId),
    uniqueIndex("team_invitations_active_uniq")
      .on(t.organizationId, sql`lower(${t.email})`)
      .where(sql`status = 'pending'`),
  ],
);

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type NewTeamInvitation = typeof teamInvitations.$inferInsert;
