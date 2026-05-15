/**
 * Stage 4.C.2 — Work packages + project tasks + task dependencies.
 *
 * Schema-name reconciliation: spec uses villas via `villa_ids UUID[]`
 * (already correct — no rename needed).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  integer,
  boolean,
  bigint,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { vendors } from "./site-operations";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const workPackages = pgTable(
  "work_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    packageCode: text("package_code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    parentId: uuid("parent_id"),
    displayOrder: integer("display_order").notNull().default(0),
    villaIds: uuid("villa_ids").array().notNull().default(sql`'{}'`),
    zoneReferences: text("zone_references").array(),
    plannedStart: date("planned_start"),
    plannedFinish: date("planned_finish"),
    actualStart: date("actual_start"),
    actualFinish: date("actual_finish"),
    progressPercentage: numeric("progress_percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    budgetCategories: uuid("budget_categories")
      .array()
      .notNull()
      .default(sql`'{}'`),
    budgetAmountMinor: bigint("budget_amount_minor", { mode: "bigint" }),
    committedAmountMinor: bigint("committed_amount_minor", { mode: "bigint" }),
    actualAmountMinor: bigint("actual_amount_minor", { mode: "bigint" }),
    responsibleUserId: uuid("responsible_user_id").references(() => appUsers.id),
    primaryVendorId: uuid("primary_vendor_id").references(() => vendors.id),
    /**
     * 'planned' | 'ready_to_start' | 'in_progress' | 'completed'
     * | 'on_hold' | 'cancelled'
     */
    status: text("status").notNull().default("planned"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("work_packages_project_idx").on(t.projectId),
    parentIdx: index("work_packages_parent_idx").on(t.parentId),
    statusIdx: index("work_packages_status_idx").on(t.status),
  }),
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskCode: text("task_code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    workPackageId: uuid("work_package_id")
      .notNull()
      .references(() => workPackages.id, { onDelete: "cascade" }),
    parentTaskId: uuid("parent_task_id"),
    displayOrder: integer("display_order").notNull().default(0),
    plannedStart: date("planned_start").notNull(),
    plannedFinish: date("planned_finish").notNull(),
    /** GENERATED STORED in DB. */
    durationDays: integer("duration_days"),
    actualStart: date("actual_start"),
    actualFinish: date("actual_finish"),
    progressPercentage: numeric("progress_percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    responsibleUserId: uuid("responsible_user_id").references(() => appUsers.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    /**
     * 'planned' | 'ready_to_start' | 'in_progress' | 'completed'
     * | 'blocked' | 'cancelled'
     */
    status: text("status").notNull().default("planned"),
    isOnCriticalPath: boolean("is_on_critical_path").notNull().default(false),
    earlyStart: date("early_start"),
    earlyFinish: date("early_finish"),
    lateStart: date("late_start"),
    lateFinish: date("late_finish"),
    totalFloatDays: integer("total_float_days"),
    cpLastComputedAt: timestamp("cp_last_computed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    wpIdx: index("project_tasks_wp_idx").on(t.workPackageId),
    parentIdx: index("project_tasks_parent_idx").on(t.parentTaskId),
    statusIdx: index("project_tasks_status_idx").on(t.status),
    plannedStartIdx: index("project_tasks_planned_start_idx").on(t.plannedStart),
  }),
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    predecessorId: uuid("predecessor_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    successorId: uuid("successor_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    /**
     * 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
     */
    dependencyType: text("dependency_type").notNull().default("finish_to_start"),
    lagDays: integer("lag_days").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    predecessorIdx: index("task_dependencies_predecessor_idx").on(t.predecessorId),
    successorIdx: index("task_dependencies_successor_idx").on(t.successorId),
    pairUnique: unique().on(t.predecessorId, t.successorId),
  }),
);

export type WorkPackage = typeof workPackages.$inferSelect;
export type NewWorkPackage = typeof workPackages.$inferInsert;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type NewProjectTask = typeof projectTasks.$inferInsert;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type NewTaskDependency = typeof taskDependencies.$inferInsert;
