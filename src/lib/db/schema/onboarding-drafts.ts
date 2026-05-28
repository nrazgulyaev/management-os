/**
 * Phase 2 data-wiring PR 1 (Mgmt slice) — onboarding_drafts.
 *
 * In-progress state across the 3-step new-owner onboarding modal.
 * TTL 14 days — a sweeper job (out of this PR's scope) drops
 * rows past `expires_at`.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Mgmt P1.
 */

import { index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";

export const onboardingDrafts = pgTable(
  "onboarding_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    directorUserId: uuid("director_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    /** 1, 2, or 3 — the modal's current step. */
    step: integer("step").notNull().default(1),
    /** Accumulating step data (owner details, villa picks, doc refs). */
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`(now() + interval '14 days')`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("onboarding_drafts_director_updated_idx").on(t.directorUserId, t.updatedAt),
    index("onboarding_drafts_expires_idx").on(t.expiresAt),
  ],
);

export type OnboardingDraft = typeof onboardingDrafts.$inferSelect;
export type NewOnboardingDraft = typeof onboardingDrafts.$inferInsert;
