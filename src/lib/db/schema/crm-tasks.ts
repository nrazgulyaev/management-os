/**
 * CRM TASKS / FOLLOW-UPS / REMINDERS (migration 0146, #169).
 *
 * One polymorphic follow-up record that hangs off any CRM subject —
 * owner / contact / lead / buyer / deal — via a `(subject_type, subject_id)`
 * discriminator. The subject id is a bare uuid (NO FK) on purpose: it lets a
 * task point at any CRM module without this schema importing a cycle of them,
 * and lets a `deal`/`lead` task exist even where that module is thin. Subject
 * ownership / visibility is enforced in the action layer, not by FK.
 *
 * Org-scoped (`organization_id` → organizations, cascade). Assignee + creator
 * + completer reference `app_users` (set-null so a task survives offboarding).
 * No money columns. Mirrors HighLevel's task model.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";

/** CRM subjects a follow-up task can hang off. */
export const CRM_TASK_SUBJECT_TYPES = [
  "owner",
  "contact",
  "lead",
  "buyer",
  "deal",
] as const;
export type CrmTaskSubjectType = (typeof CRM_TASK_SUBJECT_TYPES)[number];

export const CRM_TASK_STATUSES = ["open", "done"] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

export const CRM_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type CrmTaskPriority = (typeof CRM_TASK_PRIORITIES)[number];

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // owner | contact | lead | buyer | deal
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // low | normal | high
    priority: text("priority").notNull().default("normal"),
    assigneeUserId: uuid("assignee_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    // open | done
    status: text("status").notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByAppUserId: uuid("completed_by_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    createdByAppUserId: uuid("created_by_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("crm_tasks_subject_idx").on(
      t.organizationId,
      t.subjectType,
      t.subjectId,
      t.status,
    ),
    index("crm_tasks_assignee_due_idx").on(
      t.organizationId,
      t.assigneeUserId,
      t.status,
      t.dueAt,
    ),
    index("crm_tasks_org_due_idx").on(t.organizationId, t.status, t.dueAt),
  ],
);

export type CrmTask = typeof crmTasks.$inferSelect;
export type NewCrmTask = typeof crmTasks.$inferInsert;
