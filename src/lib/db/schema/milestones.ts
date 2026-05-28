/**
 * Phase 2 data-wiring PR 2 (Dev slice) — milestones + milestone_dependencies.
 *
 * Per-project milestone tracker that drives the Projects cabinet
 * timeline. `milestone_dependencies` carries the CPM (critical-path)
 * relationships so the schedule-variance-detector agent can walk
 * the graph for slip detection.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import { date, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { appUsers } from "./identity";

export type MilestoneKind =
  | "design"
  | "permit"
  | "site_prep"
  | "foundation"
  | "frame"
  | "mep"
  | "finishes"
  | "handover"
  | "other";

export type MilestoneStatus = "planned" | "in_progress" | "done" | "at_risk" | "slipped";

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Enum: design | permit | site_prep | foundation | frame | mep | finishes | handover | other. */
    kind: text("kind").notNull(),
    targetDate: date("target_date").notNull(),
    actualDate: date("actual_date"),
    /** Enum: planned | in_progress | done | at_risk | slipped. */
    status: text("status").notNull().default("planned"),
    ownerStaffId: uuid("owner_staff_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("milestones_project_target_idx").on(t.projectId, t.targetDate),
    index("milestones_status_target_idx").on(t.status, t.targetDate),
  ],
);

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;

/** Std CPM dependency kinds. */
export type MilestoneDependencyKind = "fs" | "ss" | "ff" | "sf";

export const milestoneDependencies = pgTable(
  "milestone_dependencies",
  {
    fromMilestoneId: uuid("from_milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    toMilestoneId: uuid("to_milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    /** Enum: fs | ss | ff | sf — finish-to-start, start-to-start, finish-to-finish, start-to-finish. */
    kind: text("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromMilestoneId, t.toMilestoneId] }),
    index("milestone_dependencies_to_idx").on(t.toMilestoneId),
  ],
);

export type MilestoneDependency = typeof milestoneDependencies.$inferSelect;
export type NewMilestoneDependency = typeof milestoneDependencies.$inferInsert;
