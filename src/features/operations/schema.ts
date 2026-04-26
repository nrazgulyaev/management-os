import { z } from "zod";

// -----------------------------------------------------------------------------
// Enums shared across the operations runtime
// -----------------------------------------------------------------------------

export const taskCategoryEnum = z.enum([
  "housekeeping",
  "maintenance",
  "inspection",
  "guest_request",
  "procurement",
  "admin",
]);

export const taskPriorityEnum = z.enum(["low", "normal", "high", "urgent"]);

export const taskStatusEnum = z.enum([
  "open",
  "scheduled",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
  "needs_review",
  "approved",
]);

export const taskSourceEnum = z.enum([
  "manual",
  "booking",
  "guest",
  "preventive",
  "inspection",
  "system",
]);

export const checklistItemTypeEnum = z.enum([
  "checkbox",
  "photo_required",
  "number",
  "text",
  "pass_fail",
]);

export const checklistItemStatusEnum = z.enum([
  "pending",
  "done",
  "failed",
  "skipped",
  "not_applicable",
]);

export const checklistStatusEnum = z.enum(["open", "in_progress", "completed", "approved"]);

export const maintenanceCategoryEnum = z.enum([
  "electrical",
  "plumbing",
  "ac",
  "pool",
  "internet",
  "furniture",
  "appliance",
  "structural",
  "landscaping",
  "pest",
  "other",
]);

export const maintenanceStatusEnum = z.enum([
  "open",
  "triaged",
  "scheduled",
  "in_progress",
  "waiting_parts",
  "resolved",
  "closed",
  "cancelled",
]);

export const damageStatusEnum = z.enum([
  "open",
  "under_review",
  "approved",
  "charged",
  "waived",
  "repaired",
  "closed",
]);

export const serviceRequestTypeEnum = z.enum([
  "cleaning",
  "laundry",
  "transfer",
  "breakfast",
  "massage",
  "private_chef",
  "maintenance",
  "concierge",
  "other",
]);

export const serviceRequestStatusEnum = z.enum([
  "new",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const frequencyEnum = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);

// -----------------------------------------------------------------------------
// Operation tasks
// -----------------------------------------------------------------------------

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const createOperationTaskSchema = z.object({
  title: z.string().min(2, "Title is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  category: taskCategoryEnum,
  priority: taskPriorityEnum.default("normal"),
  source: taskSourceEnum.default("manual"),
  taskTypeId: optionalUuid,
  villaId: optionalUuid,
  projectId: optionalUuid,
  bookingId: optionalUuid,
  guestId: optionalUuid,
  assignedTo: optionalUuid,
  scheduledFor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  dueAt: z.string().optional().or(z.literal("")),
  estimatedMinutes: z.coerce.number().int().min(1).max(60 * 24).optional(),
  ownerVisible: z.coerce.boolean().optional().default(false),
  guestVisible: z.coerce.boolean().optional().default(false),
  internalNotes: z.string().max(4000).optional().or(z.literal("")),
  // Optional template to instantiate alongside the task.
  templateId: optionalUuid,
});

export type CreateOperationTaskInput = z.infer<typeof createOperationTaskSchema>;

export const taskIdSchema = z.object({ id: z.string().uuid() });

export const updateTaskStatusSchema = z.object({
  id: z.string().uuid(),
  status: taskStatusEnum,
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const assignTaskSchema = z.object({
  id: z.string().uuid(),
  assignedTo: z.string().uuid(),
});

export const approveTaskSchema = z.object({
  id: z.string().uuid(),
});

// -----------------------------------------------------------------------------
// Checklists
// -----------------------------------------------------------------------------

export const createChecklistFromTemplateSchema = z.object({
  taskId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export const updateChecklistItemSchema = z.object({
  itemId: z.string().uuid(),
  status: checklistItemStatusEnum,
  notes: z.string().max(2000).optional().or(z.literal("")),
  valueText: z.string().max(500).optional().or(z.literal("")),
  valueNumber: z.coerce.number().optional(),
});

export const completeChecklistSchema = z.object({
  checklistId: z.string().uuid(),
});

export const approveChecklistSchema = z.object({
  checklistId: z.string().uuid(),
});

// -----------------------------------------------------------------------------
// Maintenance
// -----------------------------------------------------------------------------

export const createMaintenanceTicketSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().or(z.literal("")),
  issueCategory: maintenanceCategoryEnum,
  severity: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  villaId: optionalUuid,
  projectId: optionalUuid,
  bookingId: optionalUuid,
  ownerChargeable: z.coerce.boolean().optional().default(true),
  estimatedCostMinor: z.coerce.bigint().optional(),
  currency: z
    .string()
    .length(3)
    .toUpperCase()
    .optional()
    .or(z.literal("")),
});

export const updateMaintenanceTicketStatusSchema = z.object({
  id: z.string().uuid(),
  status: maintenanceStatusEnum,
});

// -----------------------------------------------------------------------------
// Preventive schedules
// -----------------------------------------------------------------------------

export const createPreventiveScheduleSchema = z
  .object({
    name: z.string().min(2).max(200),
    category: z.string().min(2).max(60),
    villaId: optionalUuid,
    projectId: optionalUuid,
    taskTypeId: optionalUuid,
    checklistTemplateId: optionalUuid,
    frequency: frequencyEnum,
    intervalDays: z.coerce.number().int().min(1).max(3650).optional(),
    nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    priority: taskPriorityEnum.default("normal"),
    assignedTo: optionalUuid,
  })
  .refine(
    (d) => d.frequency !== "custom" || (d.intervalDays && d.intervalDays > 0),
    { path: ["intervalDays"], message: "intervalDays is required when frequency = custom" },
  )
  .refine((d) => d.villaId || d.projectId, {
    path: ["villaId"],
    message: "Villa or project is required",
  });

// -----------------------------------------------------------------------------
// Service requests + damage reports
// -----------------------------------------------------------------------------

export const createServiceRequestSchema = z.object({
  title: z.string().min(2).max(200),
  message: z.string().max(4000).optional().or(z.literal("")),
  requestType: serviceRequestTypeEnum,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  villaId: optionalUuid,
  bookingId: optionalUuid,
  guestId: optionalUuid,
  preferredTime: z.string().optional().or(z.literal("")),
});

export const serviceRequestIdSchema = z.object({ id: z.string().uuid() });

export const createDamageReportSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().or(z.literal("")),
  villaId: optionalUuid,
  bookingId: optionalUuid,
  guestId: optionalUuid,
  taskId: optionalUuid,
  severity: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  estimatedCostMinor: z.coerce.bigint().optional(),
  currency: z
    .string()
    .length(3)
    .toUpperCase()
    .optional()
    .or(z.literal("")),
  ownerChargeable: z.coerce.boolean().optional().default(true),
  guestChargeable: z.coerce.boolean().optional().default(false),
});

export type CreateMaintenanceTicketInput = z.infer<typeof createMaintenanceTicketSchema>;
export type CreatePreventiveScheduleInput = z.infer<typeof createPreventiveScheduleSchema>;
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type CreateDamageReportInput = z.infer<typeof createDamageReportSchema>;
