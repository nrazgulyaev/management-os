import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  numeric,
  jsonb,
  date,
  time,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { appUsers } from "./identity";
import { checklistTemplates, operationTasks } from "./operations";
import { expenseLines } from "./finance";
import { organizations } from "./saas";

/**
 * V9D — preventive maintenance intelligence + utilities. Builds on V9A
 * `villa_calendar_blocks` (window scoring reads them) and V9C-era finance
 * primitives (utility payments may materialise as `expense_lines` when
 * the period is open).
 */

export const maintenanceTemplates = pgTable(
  "maintenance_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    defaultFrequency: text("default_frequency").notNull(),
    defaultIntervalDays: integer("default_interval_days"),
    defaultDurationMinutes: integer("default_duration_minutes")
      .notNull()
      .default(60),
    defaultPriority: text("default_priority").notNull().default("normal"),
    canBeDoneWhileOccupied: boolean("can_be_done_while_occupied")
      .notNull()
      .default(true),
    guestDisruptionLevel: text("guest_disruption_level")
      .notNull()
      .default("low"),
    requiresVillaEmpty: boolean("requires_villa_empty").notNull().default(false),
    requiresOwnerVisibility: boolean("requires_owner_visibility")
      .notNull()
      .default(false),
    checklistTemplateId: uuid("checklist_template_id").references(
      () => checklistTemplates.id,
      { onDelete: "set null" },
    ),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("maintenance_templates_category_idx").on(t.category),
    index("maintenance_templates_status_idx").on(t.status),
  ],
);

export const villaMaintenancePlans = pgTable(
  "villa_maintenance_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    // TENANCY (0149 add/backfill via villa -> project; 0155 NOT NULL
    // cutover). Inserts use requireOrgId().
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => maintenanceTemplates.id, { onDelete: "restrict" }),
    planName: text("plan_name").notNull(),
    frequency: text("frequency").notNull(),
    intervalDays: integer("interval_days"),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    priority: text("priority").notNull().default("normal"),
    canBeDoneWhileOccupied: boolean("can_be_done_while_occupied")
      .notNull()
      .default(true),
    guestDisruptionLevel: text("guest_disruption_level")
      .notNull()
      .default("low"),
    requiresVillaEmpty: boolean("requires_villa_empty").notNull().default(false),
    preferredWeekdays: jsonb("preferred_weekdays"),
    avoidWeekdays: jsonb("avoid_weekdays"),
    preferredTimeWindowStart: time("preferred_time_window_start"),
    preferredTimeWindowEnd: time("preferred_time_window_end"),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    lastGeneratedTaskId: uuid("last_generated_task_id").references(
      () => operationTasks.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
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
    index("villa_maintenance_plans_villa_idx").on(t.villaId),
    index("villa_maintenance_plans_project_idx").on(t.projectId),
    index("villa_maintenance_plans_template_idx").on(t.templateId),
    index("villa_maintenance_plans_status_idx").on(t.status),
    index("villa_maintenance_plans_next_due_idx").on(t.nextDueAt),
    index("villa_maintenance_plans_organization_idx").on(t.organizationId),
  ],
);

export const maintenanceWindowSuggestions = pgTable(
  "maintenance_window_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaMaintenancePlanId: uuid("villa_maintenance_plan_id")
      .notNull()
      .references(() => villaMaintenancePlans.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    // TENANCY (0149 add/backfill via plan; 0155 NOT NULL cutover).
    // Inserts copy the parent plan's org.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    suggestedStart: timestamp("suggested_start", {
      withTimezone: true,
    }).notNull(),
    suggestedEnd: timestamp("suggested_end", { withTimezone: true }).notNull(),
    score: numeric("score").notNull().default("0"),
    reason: text("reason"),
    conflictCount: integer("conflict_count").notNull().default(0),
    status: text("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("maintenance_window_suggestions_plan_idx").on(t.villaMaintenancePlanId),
    index("maintenance_window_suggestions_villa_idx").on(
      t.villaId,
      t.suggestedStart,
    ),
    index("maintenance_window_suggestions_status_idx").on(t.status),
    index("maintenance_window_suggestions_organization_idx").on(t.organizationId),
  ],
);

export const utilityAccounts = pgTable(
  "utility_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    // TENANCY (0149 add/backfill via villa/project; 0155 NOT NULL cutover).
    // Inserts use requireOrgId().
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    utilityType: text("utility_type").notNull(),
    providerName: text("provider_name"),
    accountNumber: text("account_number"),
    tokenMeter: boolean("token_meter").notNull().default(false),
    billingCycleDay: integer("billing_cycle_day"),
    currency: text("currency").notNull().default("IDR"),
    averageMonthlyCostMinor: bigint("average_monthly_cost_minor", {
      mode: "number",
    }),
    lowBalanceThresholdMinor: bigint("low_balance_threshold_minor", {
      mode: "number",
    }),
    criticalBalanceThresholdMinor: bigint("critical_balance_threshold_minor", {
      mode: "number",
    }),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("utility_accounts_villa_idx").on(t.villaId),
    index("utility_accounts_project_idx").on(t.projectId),
    index("utility_accounts_type_idx").on(t.utilityType),
    index("utility_accounts_status_idx").on(t.status),
    index("utility_accounts_organization_idx").on(t.organizationId),
  ],
);

export const utilityReadings = pgTable(
  "utility_readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    utilityAccountId: uuid("utility_account_id")
      .notNull()
      .references(() => utilityAccounts.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    // TENANCY (0149 add/backfill via utility_account; 0155 NOT NULL
    // cutover). Inserts copy the parent account's org.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    readingType: text("reading_type").notNull(),
    readingValue: numeric("reading_value"),
    balanceMinor: bigint("balance_minor", { mode: "number" }),
    currency: text("currency"),
    readingAt: timestamp("reading_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: text("source").notNull().default("manual"),
    recordedBy: uuid("recorded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("utility_readings_account_idx").on(
      t.utilityAccountId,
      sql`${t.readingAt} DESC`,
    ),
    index("utility_readings_villa_idx").on(t.villaId),
    index("utility_readings_type_idx").on(t.readingType),
    index("utility_readings_organization_idx").on(t.organizationId),
  ],
);

export const utilityPaymentReminders = pgTable(
  "utility_payment_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    utilityAccountId: uuid("utility_account_id")
      .notNull()
      .references(() => utilityAccounts.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    // TENANCY (0149 add/backfill via utility_account; 0155 NOT NULL
    // cutover). Inserts copy the parent account's org.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    dueDate: date("due_date").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: text("currency").notNull().default("IDR"),
    status: text("status").notNull().default("open"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    linkedExpenseLineId: uuid("linked_expense_line_id").references(
      () => expenseLines.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("utility_payment_reminders_account_idx").on(t.utilityAccountId),
    index("utility_payment_reminders_due_idx").on(t.dueDate),
    index("utility_payment_reminders_status_idx").on(t.status),
    index("utility_payment_reminders_organization_idx").on(t.organizationId),
  ],
);

export const maintenanceRiskEvents = pgTable(
  "maintenance_risk_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    // TENANCY (migration 0149): nullable org anchor via villa/project
    // (else ARCONIQUE_DEFAULT).
    organizationId: uuid("organization_id").references(() => organizations.id),
    riskType: text("risk_type").notNull(),
    severity: text("severity").notNull().default("medium"),
    title: text("title").notNull(),
    description: text("description"),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("maintenance_risk_events_open_unique")
      .on(t.riskType, t.sourceType, t.sourceId)
      .where(
        sql`${t.status} = 'open' AND ${t.sourceType} IS NOT NULL AND ${t.sourceId} IS NOT NULL`,
      ),
    index("maintenance_risk_events_villa_idx").on(t.villaId),
    index("maintenance_risk_events_project_idx").on(t.projectId),
    index("maintenance_risk_events_status_idx").on(t.status),
    index("maintenance_risk_events_severity_idx").on(t.severity),
    index("maintenance_risk_events_organization_idx").on(t.organizationId),
  ],
);

export type MaintenanceTemplate = typeof maintenanceTemplates.$inferSelect;
export type NewMaintenanceTemplate = typeof maintenanceTemplates.$inferInsert;
export type VillaMaintenancePlan = typeof villaMaintenancePlans.$inferSelect;
export type NewVillaMaintenancePlan =
  typeof villaMaintenancePlans.$inferInsert;
export type MaintenanceWindowSuggestion =
  typeof maintenanceWindowSuggestions.$inferSelect;
export type NewMaintenanceWindowSuggestion =
  typeof maintenanceWindowSuggestions.$inferInsert;
export type UtilityAccount = typeof utilityAccounts.$inferSelect;
export type NewUtilityAccount = typeof utilityAccounts.$inferInsert;
export type UtilityReading = typeof utilityReadings.$inferSelect;
export type NewUtilityReading = typeof utilityReadings.$inferInsert;
export type UtilityPaymentReminder = typeof utilityPaymentReminders.$inferSelect;
export type NewUtilityPaymentReminder =
  typeof utilityPaymentReminders.$inferInsert;
export type MaintenanceRiskEvent = typeof maintenanceRiskEvents.$inferSelect;
export type NewMaintenanceRiskEvent =
  typeof maintenanceRiskEvents.$inferInsert;
