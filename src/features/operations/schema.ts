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
  "archived",
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
  "archived",
]);

export const damageStatusEnum = z.enum([
  "open",
  "under_review",
  "approved",
  "charged",
  "waived",
  "repaired",
  "closed",
  "archived",
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

// Base shape (no refine) so `editMaintenanceTicketSchema` can `.extend()` it —
// `.refine()` returns a ZodEffects, which has no `.extend()`.
const maintenanceTicketBaseSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().or(z.literal("")),
  issueCategory: maintenanceCategoryEnum,
  severity: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
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

// A ticket with neither a villa nor a project has no org linkage its detail
// page can scope to (reads not-found). Require at least one, mirroring the
// refine on createPreventiveScheduleSchema below.
export const createMaintenanceTicketSchema = maintenanceTicketBaseSchema.refine(
  (d) => Boolean(d.villaId) || Boolean(d.projectId),
  { path: ["villaId"], message: "Pick a villa or a project" },
);

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

// Resolve / close a damage report — records the terminal status + the actual
// repair/charge cost. Transition is guarded server-side via
// DAMAGE_REPORT_TRANSITIONS so an operator can't skip the review flow.
export const resolveDamageReportSchema = z.object({
  id: z.string().uuid(),
  status: damageStatusEnum,
  actualCostMinor: z.coerce.bigint().optional(),
});

export const createDamageReportSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().or(z.literal("")),
  villaId: optionalUuid,
  bookingId: optionalUuid,
  guestId: optionalUuid,
  taskId: optionalUuid,
  severity: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
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

// ---------------------------------------------------------------------------
// Stage 6.P5-CATCHUP — Operations Edit + Archive schemas.
// ---------------------------------------------------------------------------

export const editOperationTaskSchema = createOperationTaskSchema
  .omit({ source: true, templateId: true })
  .extend({
    id: z.string().uuid(),
  });

export const archiveOperationTaskSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export const editMaintenanceTicketSchema = maintenanceTicketBaseSchema
  .extend({
    id: z.string().uuid(),
  })
  .refine((d) => Boolean(d.villaId) || Boolean(d.projectId), {
    path: ["villaId"],
    message: "Pick a villa or a project",
  });

export const archiveMaintenanceTicketSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export const editDamageReportSchema = createDamageReportSchema.extend({
  id: z.string().uuid(),
});

export const archiveDamageReportSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional().or(z.literal("")),
});

// Stage 7.F.A.2 — Maintenance ticket staff assignment.
// Bridges via the linked operation_task (creates one if absent) since
// maintenance_tickets has no assigned_to column.
export const assignMaintenanceTicketSchema = z.object({
  ticketId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  scheduledFor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
});

export type EditOperationTaskInput = z.infer<typeof editOperationTaskSchema>;
export type EditMaintenanceTicketInput = z.infer<typeof editMaintenanceTicketSchema>;
export type EditDamageReportInput = z.infer<typeof editDamageReportSchema>;

// ---------------------------------------------------------------------------
// Checklist template authoring (header + items in one create call).
// ---------------------------------------------------------------------------

export const checklistTemplateItemTypes = [
  "checkbox",
  "photo_required",
  "number",
  "text",
  "pass_fail",
] as const;

export const createChecklistTemplateSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase slug: letters, digits, underscores."),
  name: z.string().min(2).max(200),
  category: z.string().min(2).max(80),
  description: z.string().max(2000).optional(),
  villaType: z.string().max(80).optional(),
  items: z
    .array(
      z.object({
        section: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        itemType: z.enum(checklistTemplateItemTypes).default("checkbox"),
        isRequired: z.boolean().default(true),
      }),
    )
    .min(1, "Add at least one checklist item."),
});

export type CreateChecklistTemplateInput = z.input<
  typeof createChecklistTemplateSchema
>;

// Edit an existing template — same shape as create minus the unique `key`
// (which never changes once assigned). Items are fully replaced.
export const editChecklistTemplateSchema = createChecklistTemplateSchema
  .omit({ key: true })
  .extend({ id: z.string().uuid() });

export type EditChecklistTemplateInput = z.input<
  typeof editChecklistTemplateSchema
>;

export const deleteChecklistTemplateSchema = z.object({
  id: z.string().uuid(),
});
