/**
 * Stage 5.H — Schedule Sophistication schemas.
 *
 * 8 tables across 3 migrations:
 *   - working_calendars            calendars per project / vendor / company
 *   - holiday_calendar             holidays per calendar
 *   - schedule_baselines           immutable JSONB schedule snapshots
 *   - schedule_variances           per-task variance vs baseline (3 GENERATED columns)
 *   - resource_pools               vendor / internal / individual / equipment
 *   - task_resource_assignments    per-task allocations
 *   - productivity_logs            per-day actuals; productivity_rate GENERATED
 */

import { sql} from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  integer,
  numeric,
  boolean,
  jsonb,
  time,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { projects, villas } from "./projects";
import { appUsers } from "./identity";
import { vendors } from "./site-operations";
import { organizations } from "./saas";

export const workingCalendars = pgTable(
  "working_calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: nullable per migration 0072 reference-table list.
    organizationId: uuid("organization_id").references(() => organizations.id),
    calendarCode: text("calendar_code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    scope: text("scope").notNull(),
    projectId: uuid("project_id").references(() => projects.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    workingDaysOfWeek: integer("working_days_of_week")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6}'::int[]`),
    workingHoursPerDay: numeric("working_hours_per_day", { precision: 5, scale: 2 })
      .notNull()
      .default("8"),
    dailyStartTime: time("daily_start_time"),
    dailyEndTime: time("daily_end_time"),
    breakDurationHours: numeric("break_duration_hours", { precision: 4, scale: 2 }),
    countryCode: text("country_code").notNull().default("ID"),
    regionCode: text("region_code"),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("working_calendars_project_idx").on(t.projectId),
    index("working_calendars_vendor_idx").on(t.vendorId),
    index("working_calendars_active_idx").on(t.isActive),
  ],
);

export const holidayCalendar = pgTable(
  "holiday_calendar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => workingCalendars.id, { onDelete: "cascade" }),
    holidayDate: date("holiday_date").notNull(),
    holidayName: text("holiday_name").notNull(),
    holidayType: text("holiday_type").notNull(),
    isFullDay: boolean("is_full_day").notNull().default(true),
    partialHoursLost: numeric("partial_hours_lost", { precision: 5, scale: 2 }),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrencePattern: text("recurrence_pattern"),
    notes: text("notes"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("holiday_calendar_calendar_idx").on(t.calendarId),
    index("holiday_calendar_date_idx").on(t.holidayDate),
    uniqueIndex("holiday_calendar_calendar_date_unique").on(
      t.calendarId,
      t.holidayDate,
    ),
  ],
);

export const scheduleBaselines = pgTable(
  "schedule_baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    baselineCode: text("baseline_code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    baselineData: jsonb("baseline_data").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    isCurrentBaseline: boolean("is_current_baseline").notNull().default(true),
    supersededBy: uuid("superseded_by").references(
      (): AnyPgColumn => scheduleBaselines.id,
    ),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvalNotes: text("approval_notes"),
    calendarId: uuid("calendar_id").references(() => workingCalendars.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("schedule_baselines_project_idx").on(t.projectId),
  ],
);

export const scheduleVariances = pgTable(
  "schedule_variances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    baselineId: uuid("baseline_id")
      .notNull()
      .references(() => scheduleBaselines.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    baselinePlannedStart: date("baseline_planned_start").notNull(),
    baselinePlannedFinish: date("baseline_planned_finish").notNull(),
    baselineDurationDays: integer("baseline_duration_days").notNull(),
    baselineWasCritical: boolean("baseline_was_critical").notNull().default(false),
    currentPlannedStart: date("current_planned_start"),
    currentPlannedFinish: date("current_planned_finish"),
    currentDurationDays: integer("current_duration_days"),
    currentActualStart: date("current_actual_start"),
    currentActualFinish: date("current_actual_finish"),
    startVarianceDays: integer("start_variance_days"),
    finishVarianceDays: integer("finish_variance_days"),
    durationVarianceDays: integer("duration_variance_days"),
    varianceStatus: text("variance_status").notNull().default("unchanged"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("schedule_variances_baseline_idx").on(t.baselineId),
    index("schedule_variances_task_idx").on(t.taskId),
    index("schedule_variances_status_idx").on(t.varianceStatus),
    uniqueIndex("schedule_variances_baseline_task_unique").on(
      t.baselineId,
      t.taskId,
    ),
  ],
);

export const resourcePools = pgTable(
  "resource_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    resourceCode: text("resource_code").notNull().unique(),
    displayName: text("display_name").notNull(),
    resourceType: text("resource_type").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    totalCapacityPerDay: numeric("total_capacity_per_day", {
      precision: 10,
      scale: 2,
    }),
    capacityUnit: text("capacity_unit").notNull().default("hours"),
    standardRatePerUnitMinor: bigint("standard_rate_per_unit_minor", {
      mode: "bigint",
    }),
    rateCurrency: text("rate_currency").default("IDR"),
    defaultCalendarId: uuid("default_calendar_id").references(
      () => workingCalendars.id,
    ),
    skills: text("skills")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("resource_pools_type_idx").on(t.resourceType),
    index("resource_pools_vendor_idx").on(t.vendorId),
    index("resource_pools_active_idx").on(t.isActive),
  ],
);

export const taskResourceAssignments = pgTable(
  "task_resource_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskId: uuid("task_id").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resourcePools.id),
    allocatedCapacityPerDay: numeric("allocated_capacity_per_day", {
      precision: 10,
      scale: 2,
    }).notNull(),
    allocationStart: date("allocation_start").notNull(),
    allocationEnd: date("allocation_end").notNull(),
    status: text("status").notNull().default("planned"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_resource_assignments_task_idx").on(t.taskId),
    index("task_resource_assignments_resource_idx").on(t.resourceId),
    index("task_resource_assignments_period_idx").on(
      t.allocationStart,
      t.allocationEnd,
    ),
  ],
);

export const productivityLogs = pgTable(
  "productivity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: column added by migration 0072 (NOT NULL).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskId: uuid("task_id"),
    resourceId: uuid("resource_id").references(() => resourcePools.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    logDate: date("log_date").notNull(),
    tradeCategory: text("trade_category"),
    activityDescription: text("activity_description"),
    plannedHours: numeric("planned_hours", { precision: 8, scale: 2 }),
    actualHours: numeric("actual_hours", { precision: 8, scale: 2 }).notNull(),
    quantityCompleted: numeric("quantity_completed", { precision: 12, scale: 4 }),
    unitOfMeasure: text("unit_of_measure"),
    productivityRate: numeric("productivity_rate", {
      precision: 14,
      scale: 6,
    }),
    dataSource: text("data_source").notNull(),
    relatedSiteReportId: uuid("related_site_report_id"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => appUsers.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("productivity_logs_task_idx").on(t.taskId),
    index("productivity_logs_resource_idx").on(t.resourceId),
    index("productivity_logs_project_idx").on(t.projectId),
    index("productivity_logs_date_idx").on(t.logDate),
    index("productivity_logs_trade_idx").on(t.tradeCategory),
  ],
);

export type WorkingCalendar = typeof workingCalendars.$inferSelect;
export type NewWorkingCalendar = typeof workingCalendars.$inferInsert;
export type Holiday = typeof holidayCalendar.$inferSelect;
export type NewHoliday = typeof holidayCalendar.$inferInsert;
export type ScheduleBaseline = typeof scheduleBaselines.$inferSelect;
export type NewScheduleBaseline = typeof scheduleBaselines.$inferInsert;
export type ScheduleVariance = typeof scheduleVariances.$inferSelect;
export type NewScheduleVariance = typeof scheduleVariances.$inferInsert;
export type ResourcePool = typeof resourcePools.$inferSelect;
export type NewResourcePool = typeof resourcePools.$inferInsert;
export type TaskResourceAssignment = typeof taskResourceAssignments.$inferSelect;
export type NewTaskResourceAssignment = typeof taskResourceAssignments.$inferInsert;
export type ProductivityLog = typeof productivityLogs.$inferSelect;
export type NewProductivityLog = typeof productivityLogs.$inferInsert;
