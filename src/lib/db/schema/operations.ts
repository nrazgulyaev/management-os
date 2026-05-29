import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  numeric,
  date,
  index,
} from "drizzle-orm/pg-core";
// NOTE: v6 added Supabase-Storage columns to task_attachments — see
// drizzle/0006_inventory_procurement_attachments.sql.
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { bookings } from "./bookings";
import { guests } from "./bookings";
import { documents } from "./documents";

/**
 * Operations Runtime — tasks, checklists, maintenance tickets, preventive
 * schedules, attachments, damage reports, service requests. See
 * docs/ADR-0006_OPERATIONS_RUNTIME.md and drizzle/0005_operations_runtime.sql
 * for the full design rationale.
 *
 * Money columns follow the same BIGINT minor-unit rule as the finance domain:
 * USD 12.34 → 1234. Currency code lives alongside the amount.
 */

export const operationTaskTypes = pgTable("operation_task_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  defaultPriority: text("default_priority").notNull().default("normal"),
  defaultSlaMinutes: integer("default_sla_minutes"),
  isSystem: boolean("is_system").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const operationTasks = pgTable(
  "operation_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskCode: text("task_code").notNull().unique(),
    taskTypeId: uuid("task_type_id").references(() => operationTaskTypes.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    source: text("source").notNull().default("manual"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    scheduledFor: date("scheduled_for"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => appUsers.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => appUsers.id, { onDelete: "set null" }),
    estimatedMinutes: integer("estimated_minutes"),
    actualMinutes: integer("actual_minutes"),
    internalNotes: text("internal_notes"),
    ownerVisible: boolean("owner_visible").notNull().default(false),
    guestVisible: boolean("guest_visible").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("operation_tasks_status_idx").on(t.status),
    index("operation_tasks_category_idx").on(t.category),
    index("operation_tasks_villa_idx").on(t.villaId),
    index("operation_tasks_project_idx").on(t.projectId),
    index("operation_tasks_assigned_idx").on(t.assignedTo),
    index("operation_tasks_scheduled_idx").on(t.scheduledFor),
    index("operation_tasks_due_idx").on(t.dueAt),
    index("operation_tasks_priority_idx").on(t.priority),
  ],
);

export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  villaType: text("villa_type"),
  status: text("status").notNull().default("active"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checklistTemplateItems = pgTable(
  "checklist_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => checklistTemplates.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    itemType: text("item_type").notNull().default("checkbox"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checklist_template_items_template_idx").on(t.templateId, t.sortOrder)],
);

export const taskChecklists = pgTable(
  "task_checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => operationTasks.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => checklistTemplates.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("open"),
    completedBy: uuid("completed_by").references(() => appUsers.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_checklists_task_idx").on(t.taskId),
    index("task_checklists_status_idx").on(t.status),
  ],
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => taskChecklists.id, { onDelete: "cascade" }),
    templateItemId: uuid("template_item_id").references(() => checklistTemplateItems.id, {
      onDelete: "set null",
    }),
    section: text("section").notNull(),
    label: text("label").notNull(),
    itemType: text("item_type").notNull().default("checkbox"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("pending"),
    valueText: text("value_text"),
    valueNumber: numeric("value_number"),
    photoRequired: boolean("photo_required").notNull().default(false),
    completedBy: uuid("completed_by").references(() => appUsers.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_checklist_items_checklist_idx").on(t.checklistId, t.sortOrder),
    index("task_checklist_items_status_idx").on(t.status),
  ],
);

export const maintenanceTickets = pgTable(
  "maintenance_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketCode: text("ticket_code").notNull().unique(),
    taskId: uuid("task_id").references(() => operationTasks.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").references(() => appUsers.id, { onDelete: "set null" }),
    reportedByGuestId: uuid("reported_by_guest_id").references(() => guests.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    issueCategory: text("issue_category").notNull(),
    severity: text("severity").notNull().default("p2"),
    status: text("status").notNull().default("open"),
    ownerChargeable: boolean("owner_chargeable").notNull().default(true),
    estimatedCostMinor: bigint("estimated_cost_minor", { mode: "bigint" }),
    actualCostMinor: bigint("actual_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("maintenance_tickets_status_idx").on(t.status),
    index("maintenance_tickets_villa_idx").on(t.villaId),
    index("maintenance_tickets_severity_idx").on(t.severity),
  ],
);

export const preventiveSchedules = pgTable(
  "preventive_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskTypeId: uuid("task_type_id").references(() => operationTaskTypes.id, {
      onDelete: "set null",
    }),
    checklistTemplateId: uuid("checklist_template_id").references(() => checklistTemplates.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    frequency: text("frequency").notNull(),
    intervalDays: integer("interval_days"),
    nextDueOn: date("next_due_on").notNull(),
    lastGeneratedOn: date("last_generated_on"),
    priority: text("priority").notNull().default("normal"),
    assignedTo: uuid("assigned_to").references(() => appUsers.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("preventive_schedules_due_idx").on(t.nextDueOn),
    index("preventive_schedules_status_idx").on(t.status),
    index("preventive_schedules_villa_idx").on(t.villaId),
    index("preventive_schedules_project_idx").on(t.projectId),
  ],
);

export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => operationTasks.id, { onDelete: "cascade" }),
    checklistItemId: uuid("checklist_item_id").references(() => taskChecklistItems.id, {
      onDelete: "cascade",
    }),
    maintenanceTicketId: uuid("maintenance_ticket_id").references(() => maintenanceTickets.id, {
      onDelete: "cascade",
    }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    attachmentType: text("attachment_type").notNull().default("photo"),
    caption: text("caption"),
    uploadedBy: uuid("uploaded_by").references(() => appUsers.id, { onDelete: "set null" }),
    // v6 — Supabase Storage metadata. The actual bytes live in the
    // `task-attachments` bucket; rows here track location + lifecycle.
    storageBucket: text("storage_bucket"),
    storagePath: text("storage_path"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    uploadStatus: text("upload_status").notNull().default("pending"),
    signedUrlExpiresAt: timestamp("signed_url_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_attachments_task_idx").on(t.taskId),
    index("task_attachments_ticket_idx").on(t.maintenanceTicketId),
    index("task_attachments_item_idx").on(t.checklistItemId),
  ],
);

export const damageReports = pgTable(
  "damage_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => operationTasks.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").references(() => appUsers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity").notNull().default("p2"),
    estimatedCostMinor: bigint("estimated_cost_minor", { mode: "bigint" }),
    actualCostMinor: bigint("actual_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    ownerChargeable: boolean("owner_chargeable").notNull().default(true),
    guestChargeable: boolean("guest_chargeable").notNull().default(false),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("damage_reports_status_idx").on(t.status),
    index("damage_reports_villa_idx").on(t.villaId),
  ],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestCode: text("request_code").notNull().unique(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => operationTasks.id, { onDelete: "set null" }),
    requestType: text("request_type").notNull(),
    title: text("title").notNull(),
    message: text("message"),
    status: text("status").notNull().default("new"),
    priority: text("priority").notNull().default("normal"),
    preferredTime: timestamp("preferred_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("service_requests_status_idx").on(t.status),
    index("service_requests_villa_idx").on(t.villaId),
    index("service_requests_booking_idx").on(t.bookingId),
  ],
);

export type OperationTaskType = typeof operationTaskTypes.$inferSelect;
export type OperationTask = typeof operationTasks.$inferSelect;
export type NewOperationTask = typeof operationTasks.$inferInsert;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type ChecklistTemplateItem = typeof checklistTemplateItems.$inferSelect;
export type TaskChecklist = typeof taskChecklists.$inferSelect;
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type MaintenanceTicket = typeof maintenanceTickets.$inferSelect;
export type PreventiveSchedule = typeof preventiveSchedules.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type DamageReport = typeof damageReports.$inferSelect;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
