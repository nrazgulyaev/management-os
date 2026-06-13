"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  checklistTemplateItems,
  checklistTemplates,
  damageReports,
  maintenanceTickets,
  operationTasks,
  preventiveSchedules,
  serviceRequests,
  taskChecklistItems,
  taskChecklists,
} from "@/lib/db/schema/operations";
import { villas, projects } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  approveChecklistSchema,
  approveTaskSchema,
  archiveDamageReportSchema,
  createChecklistTemplateSchema,
  type CreateChecklistTemplateInput,
  archiveMaintenanceTicketSchema,
  archiveOperationTaskSchema,
  assignMaintenanceTicketSchema,
  assignTaskSchema,
  completeChecklistSchema,
  createChecklistFromTemplateSchema,
  createDamageReportSchema,
  createMaintenanceTicketSchema,
  createOperationTaskSchema,
  createPreventiveScheduleSchema,
  createServiceRequestSchema,
  editDamageReportSchema,
  editMaintenanceTicketSchema,
  editOperationTaskSchema,
  serviceRequestIdSchema,
  updateChecklistItemSchema,
  updateMaintenanceTicketStatusSchema,
  updateTaskStatusSchema,
} from "./schema";
import {
  buildMaintenanceCode,
  buildServiceRequestCode,
  buildTaskCode,
} from "./codes";
import { evaluateChecklistReadiness, templateItemRequiresPhoto } from "./checklists";
import { countUploadedAttachmentsForChecklistItems } from "@/features/attachments/services";
import {
  MAINTENANCE_TRANSITIONS,
  SERVICE_REQUEST_TRANSITIONS,
  TASK_TRANSITIONS,
  canTransition,
  computeNextDueOn,
  todayYmd,
} from "./scheduling";
import { nextDailyCounter } from "./services";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Operation tasks
// -----------------------------------------------------------------------------

export async function createOperationTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createOperationTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const counter = await nextDailyCounter("OPS");
  const taskCode = buildTaskCode(counter);

  const [task] = await db
    .insert(operationTasks)
    .values({
      organizationId,
      taskCode,
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      category: d.category,
      priority: d.priority,
      source: d.source,
      taskTypeId: d.taskTypeId ?? null,
      villaId: d.villaId ?? null,
      projectId: d.projectId ?? null,
      bookingId: d.bookingId ?? null,
      guestId: d.guestId ?? null,
      assignedTo: d.assignedTo ?? null,
      scheduledFor: d.scheduledFor && d.scheduledFor !== "" ? d.scheduledFor : null,
      dueAt: d.dueAt && d.dueAt !== "" ? new Date(d.dueAt) : null,
      estimatedMinutes: d.estimatedMinutes ?? null,
      ownerVisible: d.ownerVisible,
      guestVisible: d.guestVisible,
      internalNotes:
        d.internalNotes && d.internalNotes !== "" ? d.internalNotes : null,
      createdBy: me?.id ?? null,
      status: d.assignedTo ? "scheduled" : "open",
    })
    .returning({ id: operationTasks.id });

  if (d.templateId) {
    await instantiateChecklistFromTemplate(task.id, d.templateId);
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.task.create",
    entityType: "operation_task",
    entityId: task.id,
    after: { taskCode, category: d.category, priority: d.priority },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/operations/tasks");
  revalidatePath("/field");
  return { ok: true, redirectTo: `/dashboard/operations/tasks/${task.id}` };
}

export async function updateOperationTaskStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = updateTaskStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Please review the form." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, parsed.data.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };

  if (!canTransition(TASK_TRANSITIONS, before.status, parsed.data.status)) {
    return {
      ok: false,
      error: `Cannot move task from "${before.status}" to "${parsed.data.status}".`,
    };
  }

  const now = new Date();
  const patch: Partial<typeof operationTasks.$inferInsert> = {
    status: parsed.data.status,
    internalNotes:
      parsed.data.notes && parsed.data.notes !== ""
        ? `${before.internalNotes ? before.internalNotes + "\n\n" : ""}${parsed.data.notes}`
        : before.internalNotes,
  };
  if (parsed.data.status === "in_progress" && !before.startedAt) patch.startedAt = now;
  if (parsed.data.status === "completed" && !before.completedAt) patch.completedAt = now;
  if (parsed.data.status === "cancelled" && !before.cancelledAt) patch.cancelledAt = now;

  await db
    .update(operationTasks)
    .set(patch)
    .where(
      and(
        eq(operationTasks.id, parsed.data.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.task.status",
    entityType: "operation_task",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.status },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/operations/tasks");
  revalidatePath(`/dashboard/operations/tasks/${parsed.data.id}`);
  revalidatePath(`/field/tasks/${parsed.data.id}`);
  return { ok: true };
}

export async function assignOperationTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.assign");
  const parsed = assignTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Please review the form." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, parsed.data.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };

  await db
    .update(operationTasks)
    .set({
      assignedTo: parsed.data.assignedTo,
      status: before.status === "open" ? "scheduled" : before.status,
    })
    .where(
      and(
        eq(operationTasks.id, parsed.data.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.task.assign",
    entityType: "operation_task",
    entityId: parsed.data.id,
    before: { assignedTo: before.assignedTo },
    after: { assignedTo: parsed.data.assignedTo },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath(`/dashboard/operations/tasks/${parsed.data.id}`);
  return { ok: true };
}

export async function approveOperationTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.approve");
  const parsed = approveTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Please review the form." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, parsed.data.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };
  if (!["completed", "needs_review"].includes(before.status)) {
    return { ok: false, error: `Cannot approve a task in status "${before.status}".` };
  }

  const now = new Date();
  await db
    .update(operationTasks)
    .set({ status: "approved", approvedAt: now, approvedBy: me?.id ?? null })
    .where(
      and(
        eq(operationTasks.id, parsed.data.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.task.approve",
    entityType: "operation_task",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "approved" },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath(`/dashboard/operations/tasks/${parsed.data.id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Checklists
// -----------------------------------------------------------------------------

async function instantiateChecklistFromTemplate(
  taskId: string,
  templateId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, templateId))
    .limit(1);
  if (!template) return null;

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, templateId))
    .orderBy(asc(checklistTemplateItems.sortOrder));

  const [checklist] = await db
    .insert(taskChecklists)
    .values({ taskId, templateId, status: "open" })
    .returning({ id: taskChecklists.id });

  if (items.length > 0) {
    await db.insert(taskChecklistItems).values(
      items.map((it) => ({
        checklistId: checklist.id,
        templateItemId: it.id,
        section: it.section,
        label: it.label,
        itemType: it.itemType,
        isRequired: it.isRequired,
        sortOrder: it.sortOrder,
        photoRequired: templateItemRequiresPhoto(it.itemType),
        status: "pending",
      })),
    );
  }
  return checklist.id;
}

export async function createChecklistFromTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createChecklistFromTemplateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing taskId or templateId." };
  const id = await instantiateChecklistFromTemplate(parsed.data.taskId, parsed.data.templateId);
  if (!id) return { ok: false, error: "Template not found or DB unavailable." };

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.checklist.create",
    entityType: "task_checklist",
    entityId: id,
    after: { taskId: parsed.data.taskId, templateId: parsed.data.templateId },
  });

  revalidatePath(`/dashboard/operations/tasks/${parsed.data.taskId}`);
  revalidatePath(`/field/tasks/${parsed.data.taskId}`);
  return { ok: true };
}

export async function updateChecklistItemAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = updateChecklistItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Please review the item." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [item] = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, parsed.data.itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Checklist item not found." };

  const isTerminal = parsed.data.status !== "pending";
  await db
    .update(taskChecklistItems)
    .set({
      status: parsed.data.status,
      notes:
        parsed.data.notes && parsed.data.notes !== ""
          ? parsed.data.notes
          : item.notes,
      valueText:
        parsed.data.valueText && parsed.data.valueText !== ""
          ? parsed.data.valueText
          : item.valueText,
      valueNumber:
        parsed.data.valueNumber === undefined
          ? item.valueNumber
          : (String(parsed.data.valueNumber) as unknown as typeof item.valueNumber),
      completedBy: isTerminal ? me?.id ?? null : null,
      completedAt: isTerminal ? new Date() : null,
    })
    .where(eq(taskChecklistItems.id, parsed.data.itemId));

  // Promote checklist to in_progress on first touch.
  await db
    .update(taskChecklists)
    .set({ status: "in_progress" })
    .where(
      and(
        eq(taskChecklists.id, item.checklistId),
        eq(taskChecklists.status, "open"),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.checklist_item.update",
    entityType: "task_checklist_item",
    entityId: parsed.data.itemId,
    before: { status: item.status },
    after: { status: parsed.data.status },
  });

  return { ok: true };
}

export async function completeChecklistAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = completeChecklistSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing checklistId." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [checklist] = await db
    .select()
    .from(taskChecklists)
    .where(eq(taskChecklists.id, parsed.data.checklistId))
    .limit(1);
  if (!checklist) return { ok: false, error: "Checklist not found." };

  const items = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.checklistId, parsed.data.checklistId));

  // v5: enforce photo_required by counting actually-uploaded attachments.
  const photoRequiredItemIds = items
    .filter((i) => i.photoRequired)
    .map((i) => i.id);
  const attachmentCounts = await countUploadedAttachmentsForChecklistItems(
    photoRequiredItemIds,
  );

  const readiness = evaluateChecklistReadiness(
    items.map((i) => ({
      status: i.status as "pending" | "done" | "failed" | "skipped" | "not_applicable",
      isRequired: i.isRequired,
      photoRequired: i.photoRequired,
      hasAttachment: i.photoRequired
        ? (attachmentCounts.get(i.id) ?? 0) > 0
        : true,
    })),
  );
  if (!readiness.canComplete) {
    return {
      ok: false,
      error: `Checklist not ready: ${readiness.blockers.join(", ")}.`,
    };
  }

  await db
    .update(taskChecklists)
    .set({ status: "completed", completedAt: new Date(), completedBy: me?.id ?? null })
    .where(eq(taskChecklists.id, parsed.data.checklistId));

  await db
    .update(operationTasks)
    .set({ status: "needs_review" })
    .where(
      and(
        eq(operationTasks.id, checklist.taskId),
        eq(operationTasks.status, "in_progress"),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.checklist.complete",
    entityType: "task_checklist",
    entityId: parsed.data.checklistId,
    after: { taskId: checklist.taskId },
  });

  revalidatePath(`/dashboard/operations/tasks/${checklist.taskId}`);
  revalidatePath(`/field/tasks/${checklist.taskId}`);
  return { ok: true };
}

export async function approveChecklistAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.approve");
  const parsed = approveChecklistSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing checklistId." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [checklist] = await db
    .select()
    .from(taskChecklists)
    .where(eq(taskChecklists.id, parsed.data.checklistId))
    .limit(1);
  if (!checklist) return { ok: false, error: "Checklist not found." };
  if (checklist.status !== "completed") {
    return { ok: false, error: "Only completed checklists can be approved." };
  }

  const now = new Date();
  await db
    .update(taskChecklists)
    .set({ status: "approved", approvedBy: me?.id ?? null, approvedAt: now })
    .where(eq(taskChecklists.id, parsed.data.checklistId));

  await db
    .update(operationTasks)
    .set({ status: "approved", approvedAt: now, approvedBy: me?.id ?? null })
    .where(eq(operationTasks.id, checklist.taskId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.checklist.approve",
    entityType: "task_checklist",
    entityId: parsed.data.checklistId,
    after: { taskId: checklist.taskId },
  });

  revalidatePath(`/dashboard/operations/tasks/${checklist.taskId}`);
  revalidatePath(`/field/tasks/${checklist.taskId}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Maintenance tickets
// -----------------------------------------------------------------------------

/**
 * TENANCY: `maintenance_tickets` has no organization_id column — its only org
 * anchor is the (nullable) villaId / projectId / bookingId. This resolves the
 * row's owning org transitively (villa -> project, else project, else booking)
 * and returns true only when it matches the caller's org. If all three anchors
 * are null OR the resolved org differs, the ticket is treated as not found so a
 * cross-org operator can't mutate it.
 */
async function ticketBelongsToOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  anchors: { villaId: string | null; projectId: string | null; bookingId: string | null },
  organizationId: string,
): Promise<boolean> {
  if (anchors.villaId) {
    const [v] = await db
      .select({ organizationId: projects.organizationId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, anchors.villaId))
      .limit(1);
    if (v?.organizationId) return v.organizationId === organizationId;
  }
  if (anchors.projectId) {
    const [p] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, anchors.projectId))
      .limit(1);
    if (p?.organizationId) return p.organizationId === organizationId;
  }
  if (anchors.bookingId) {
    const [b] = await db
      .select({ organizationId: bookings.organizationId })
      .from(bookings)
      .where(eq(bookings.id, anchors.bookingId))
      .limit(1);
    if (b?.organizationId) return b.organizationId === organizationId;
  }
  return false;
}

export async function createMaintenanceTicketAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("maintenance.write");
  const parsed = createMaintenanceTicketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const counter = await nextDailyCounter("MNT");
  const ticketCode = buildMaintenanceCode(counter);

  const [row] = await db
    .insert(maintenanceTickets)
    .values({
      ticketCode,
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      issueCategory: d.issueCategory,
      severity: d.severity,
      villaId: d.villaId ?? null,
      projectId: d.projectId ?? null,
      bookingId: d.bookingId ?? null,
      ownerChargeable: d.ownerChargeable,
      estimatedCostMinor: d.estimatedCostMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      reportedBy: me?.id ?? null,
    })
    .returning({ id: maintenanceTickets.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance.ticket.create",
    entityType: "maintenance_ticket",
    entityId: row.id,
    after: { ticketCode, severity: d.severity, issueCategory: d.issueCategory },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/operations/maintenance");
  return { ok: true, redirectTo: `/dashboard/operations/maintenance/${row.id}` };
}

export async function updateMaintenanceTicketStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("maintenance.write");
  const parsed = updateMaintenanceTicketStatusSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Please review the form." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Ticket not found." };
  if (!(await ticketBelongsToOrg(db, before, organizationId))) {
    return { ok: false, error: "Ticket not found." };
  }
  if (!canTransition(MAINTENANCE_TRANSITIONS, before.status, parsed.data.status)) {
    return {
      ok: false,
      error: `Cannot move ticket from "${before.status}" to "${parsed.data.status}".`,
    };
  }

  const now = new Date();
  const patch: Partial<typeof maintenanceTickets.$inferInsert> = { status: parsed.data.status };
  if (parsed.data.status === "resolved" && !before.resolvedAt) patch.resolvedAt = now;
  if (parsed.data.status === "closed" && !before.closedAt) patch.closedAt = now;

  await db.update(maintenanceTickets).set(patch).where(eq(maintenanceTickets.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance.ticket.status",
    entityType: "maintenance_ticket",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.status },
  });

  revalidatePath("/dashboard/operations/maintenance");
  revalidatePath(`/dashboard/operations/maintenance/${parsed.data.id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Preventive schedules
// -----------------------------------------------------------------------------

export async function createPreventiveScheduleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createPreventiveScheduleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const [row] = await db
    .insert(preventiveSchedules)
    .values({
      name: d.name,
      category: d.category,
      villaId: d.villaId ?? null,
      projectId: d.projectId ?? null,
      taskTypeId: d.taskTypeId ?? null,
      checklistTemplateId: d.checklistTemplateId ?? null,
      frequency: d.frequency,
      intervalDays: d.intervalDays ?? null,
      nextDueOn: d.nextDueOn,
      priority: d.priority,
      assignedTo: d.assignedTo ?? null,
    })
    .returning({ id: preventiveSchedules.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.preventive.create",
    entityType: "preventive_schedule",
    entityId: row.id,
    after: { name: d.name, frequency: d.frequency, nextDueOn: d.nextDueOn },
  });

  revalidatePath("/dashboard/operations/preventive");
  return { ok: true };
}

export interface GenerateDueResult {
  generated: number;
  taskIds: string[];
}

/**
 * Materialise tasks for every active preventive_schedule whose `next_due_on`
 * is today or earlier. Idempotent for the day: if a schedule has already
 * been generated today (last_generated_on = today), it is skipped.
 */
export async function generateDuePreventiveTasksAction(): Promise<
  ActionResult & { generated?: number }
> {
  await requirePermission("operations.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const today = todayYmd();

  const due = await db
    .select()
    .from(preventiveSchedules)
    .where(eq(preventiveSchedules.status, "active"));

  let generated = 0;
  for (const s of due) {
    if (s.nextDueOn > today) continue;
    if (s.lastGeneratedOn === today) continue;

    const counter = await nextDailyCounter("OPS");
    const taskCode = buildTaskCode(counter);

    const [task] = await db
      .insert(operationTasks)
      .values({
        organizationId,
        taskCode,
        title: s.name,
        category: s.category,
        priority: s.priority,
        source: "preventive",
        taskTypeId: s.taskTypeId,
        villaId: s.villaId,
        projectId: s.projectId,
        assignedTo: s.assignedTo,
        scheduledFor: today,
        status: s.assignedTo ? "scheduled" : "open",
      })
      .returning({ id: operationTasks.id });

    if (s.checklistTemplateId) {
      await instantiateChecklistFromTemplate(task.id, s.checklistTemplateId);
    }

    const next = computeNextDueOn({
      frequency: s.frequency as Parameters<typeof computeNextDueOn>[0]["frequency"],
      intervalDays: s.intervalDays,
      from: today,
    });

    await db
      .update(preventiveSchedules)
      .set({ lastGeneratedOn: today, nextDueOn: next })
      .where(eq(preventiveSchedules.id, s.id));

    generated++;
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "operations.preventive.generate",
      entityType: "preventive_schedule",
      entityId: s.id,
      after: { taskId: task.id, nextDueOn: next },
    });
  }

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/operations/preventive");
  return { ok: true, generated };
}

// -----------------------------------------------------------------------------
// Service requests
// -----------------------------------------------------------------------------

export async function createServiceRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("service_request.write");
  const parsed = createServiceRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const counter = await nextDailyCounter("SR");
  const requestCode = buildServiceRequestCode(counter);

  const [row] = await db
    .insert(serviceRequests)
    .values({
      requestCode,
      title: d.title,
      message: d.message && d.message !== "" ? d.message : null,
      requestType: d.requestType,
      priority: d.priority,
      villaId: d.villaId ?? null,
      bookingId: d.bookingId ?? null,
      guestId: d.guestId ?? null,
      preferredTime:
        d.preferredTime && d.preferredTime !== "" ? new Date(d.preferredTime) : null,
    })
    .returning({ id: serviceRequests.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "service_request.create",
    entityType: "service_request",
    entityId: row.id,
    after: { requestCode, requestType: d.requestType },
  });

  revalidatePath("/dashboard/operations/service-requests");
  return { ok: true, redirectTo: `/dashboard/operations/service-requests/${row.id}` };
}

export async function acceptServiceRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionServiceRequest(formData, "accepted");
}

export async function completeServiceRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionServiceRequest(formData, "completed");
}

async function transitionServiceRequest(
  formData: FormData,
  to: "accepted" | "completed" | "cancelled",
): Promise<ActionResult> {
  await requirePermission("service_request.write");
  const parsed = serviceRequestIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Service request not found." };
  if (!canTransition(SERVICE_REQUEST_TRANSITIONS, before.status, to)) {
    return {
      ok: false,
      error: `Cannot move service request from "${before.status}" to "${to}".`,
    };
  }
  await db
    .update(serviceRequests)
    .set({ status: to })
    .where(eq(serviceRequests.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `service_request.${to}`,
    entityType: "service_request",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: to },
  });

  revalidatePath("/dashboard/operations/service-requests");
  revalidatePath(`/dashboard/operations/service-requests/${parsed.data.id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Damage reports
// -----------------------------------------------------------------------------

/**
 * TENANCY: `damage_reports` has no organization_id column. Resolve its owning
 * org transitively (villa -> project, else booking, else linked task) and
 * return true only when it matches the caller's org. All-null / mismatch is
 * treated as not found so a cross-org operator can't mutate the row.
 */
async function damageReportBelongsToOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  anchors: { villaId: string | null; bookingId: string | null; taskId: string | null },
  organizationId: string,
): Promise<boolean> {
  if (anchors.villaId) {
    const [v] = await db
      .select({ organizationId: projects.organizationId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, anchors.villaId))
      .limit(1);
    if (v?.organizationId) return v.organizationId === organizationId;
  }
  if (anchors.bookingId) {
    const [b] = await db
      .select({ organizationId: bookings.organizationId })
      .from(bookings)
      .where(eq(bookings.id, anchors.bookingId))
      .limit(1);
    if (b?.organizationId) return b.organizationId === organizationId;
  }
  if (anchors.taskId) {
    const [t] = await db
      .select({ organizationId: operationTasks.organizationId })
      .from(operationTasks)
      .where(eq(operationTasks.id, anchors.taskId))
      .limit(1);
    if (t?.organizationId) return t.organizationId === organizationId;
  }
  return false;
}

export async function createDamageReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createDamageReportSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const [row] = await db
    .insert(damageReports)
    .values({
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      villaId: d.villaId ?? null,
      bookingId: d.bookingId ?? null,
      guestId: d.guestId ?? null,
      taskId: d.taskId ?? null,
      severity: d.severity,
      estimatedCostMinor: d.estimatedCostMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      ownerChargeable: d.ownerChargeable,
      guestChargeable: d.guestChargeable,
      reportedBy: me?.id ?? null,
    })
    .returning({ id: damageReports.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.damage.create",
    entityType: "damage_report",
    entityId: row.id,
    after: { severity: d.severity, ownerChargeable: d.ownerChargeable },
  });

  revalidatePath("/dashboard/operations/damage-reports");
  return { ok: true, redirectTo: `/dashboard/operations/damage-reports` };
}

// -----------------------------------------------------------------------------
// Stage 6.P5-CATCHUP — Edit + Archive actions for Tasks / Maintenance / Damage.
// "Archive" is a soft delete that flips status to "archived" + stamps the
// timestamp; queries that hide archived rows simply add `status != 'archived'`.
// -----------------------------------------------------------------------------

export async function editOperationTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = editOperationTaskSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, d.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };
  if (before.status === "archived") {
    return { ok: false, error: "Cannot edit an archived task. Restore it first." };
  }

  await db
    .update(operationTasks)
    .set({
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      category: d.category,
      priority: d.priority,
      taskTypeId: d.taskTypeId ?? null,
      villaId: d.villaId ?? null,
      projectId: d.projectId ?? null,
      bookingId: d.bookingId ?? null,
      guestId: d.guestId ?? null,
      assignedTo: d.assignedTo ?? null,
      scheduledFor:
        d.scheduledFor && d.scheduledFor !== "" ? d.scheduledFor : null,
      dueAt: d.dueAt && d.dueAt !== "" ? new Date(d.dueAt) : null,
      estimatedMinutes: d.estimatedMinutes ?? null,
      ownerVisible: d.ownerVisible,
      guestVisible: d.guestVisible,
      internalNotes:
        d.internalNotes && d.internalNotes !== "" ? d.internalNotes : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(operationTasks.id, d.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.task.edit",
    entityType: "operation_task",
    entityId: d.id,
    before: {
      title: before.title,
      category: before.category,
      priority: before.priority,
      status: before.status,
    },
    after: { title: d.title, category: d.category, priority: d.priority },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/operations/tasks");
  revalidatePath(`/dashboard/operations/tasks/${d.id}`);
  return { ok: true, redirectTo: `/dashboard/operations/tasks/${d.id}` };
}

export async function archiveOperationTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = archiveOperationTaskSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, d.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };
  if (before.status === "archived") {
    return { ok: false, error: "Already archived." };
  }

  const now = new Date();
  await db
    .update(operationTasks)
    .set({
      status: "archived",
      cancelledAt: now,
      internalNotes: d.reason && d.reason !== ""
        ? `[archived] ${d.reason}\n\n${before.internalNotes ?? ""}`.trim()
        : before.internalNotes,
      updatedAt: now,
    })
    .where(
      and(
        eq(operationTasks.id, d.id),
        eq(operationTasks.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.task.archive",
    entityType: "operation_task",
    entityId: d.id,
    before: { status: before.status },
    after: { status: "archived", reason: d.reason ?? null },
  });

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/operations/tasks");
  return { ok: true, redirectTo: `/dashboard/operations/tasks` };
}

export async function editMaintenanceTicketAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = editMaintenanceTicketSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, d.id))
    .limit(1);
  if (!before) return { ok: false, error: "Ticket not found." };
  if (!(await ticketBelongsToOrg(db, before, organizationId))) {
    return { ok: false, error: "Ticket not found." };
  }
  if (before.status === "archived") {
    return {
      ok: false,
      error: "Cannot edit an archived ticket. Restore it first.",
    };
  }

  await db
    .update(maintenanceTickets)
    .set({
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      issueCategory: d.issueCategory,
      severity: d.severity,
      villaId: d.villaId ?? null,
      projectId: d.projectId ?? null,
      bookingId: d.bookingId ?? null,
      ownerChargeable: d.ownerChargeable,
      estimatedCostMinor: d.estimatedCostMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceTickets.id, d.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.maintenance.edit",
    entityType: "maintenance_ticket",
    entityId: d.id,
    before: {
      title: before.title,
      severity: before.severity,
      issueCategory: before.issueCategory,
    },
    after: {
      title: d.title,
      severity: d.severity,
      issueCategory: d.issueCategory,
    },
  });

  revalidatePath("/dashboard/operations/maintenance");
  revalidatePath(`/dashboard/operations/maintenance/${d.id}`);
  return { ok: true, redirectTo: `/dashboard/operations/maintenance/${d.id}` };
}

export async function archiveMaintenanceTicketAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = archiveMaintenanceTicketSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, d.id))
    .limit(1);
  if (!before) return { ok: false, error: "Ticket not found." };
  if (!(await ticketBelongsToOrg(db, before, organizationId))) {
    return { ok: false, error: "Ticket not found." };
  }
  if (before.status === "archived") {
    return { ok: false, error: "Already archived." };
  }

  const now = new Date();
  await db
    .update(maintenanceTickets)
    .set({
      status: "archived",
      closedAt: before.closedAt ?? now,
      updatedAt: now,
    })
    .where(eq(maintenanceTickets.id, d.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.maintenance.archive",
    entityType: "maintenance_ticket",
    entityId: d.id,
    before: { status: before.status },
    after: { status: "archived", reason: d.reason ?? null },
  });

  revalidatePath("/dashboard/operations/maintenance");
  return { ok: true, redirectTo: `/dashboard/operations/maintenance` };
}

export async function editDamageReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = editDamageReportSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(damageReports)
    .where(eq(damageReports.id, d.id))
    .limit(1);
  if (!before) return { ok: false, error: "Report not found." };
  if (!(await damageReportBelongsToOrg(db, before, organizationId))) {
    return { ok: false, error: "Report not found." };
  }
  if (before.status === "archived") {
    return {
      ok: false,
      error: "Cannot edit an archived report. Restore it first.",
    };
  }

  await db
    .update(damageReports)
    .set({
      title: d.title,
      description: d.description && d.description !== "" ? d.description : null,
      villaId: d.villaId ?? null,
      bookingId: d.bookingId ?? null,
      guestId: d.guestId ?? null,
      taskId: d.taskId ?? null,
      severity: d.severity,
      estimatedCostMinor: d.estimatedCostMinor ?? null,
      currency: d.currency && d.currency !== "" ? d.currency : null,
      ownerChargeable: d.ownerChargeable,
      guestChargeable: d.guestChargeable,
      updatedAt: new Date(),
    })
    .where(eq(damageReports.id, d.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.damage.edit",
    entityType: "damage_report",
    entityId: d.id,
    before: { title: before.title, severity: before.severity },
    after: { title: d.title, severity: d.severity },
  });

  revalidatePath("/dashboard/operations/damage-reports");
  return { ok: true, redirectTo: `/dashboard/operations/damage-reports` };
}

export async function archiveDamageReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = archiveDamageReportSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(damageReports)
    .where(eq(damageReports.id, d.id))
    .limit(1);
  if (!before) return { ok: false, error: "Report not found." };
  if (!(await damageReportBelongsToOrg(db, before, organizationId))) {
    return { ok: false, error: "Report not found." };
  }
  if (before.status === "archived") {
    return { ok: false, error: "Already archived." };
  }

  await db
    .update(damageReports)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(damageReports.id, d.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.damage.archive",
    entityType: "damage_report",
    entityId: d.id,
    before: { status: before.status },
    after: { status: "archived", reason: d.reason ?? null },
  });

  revalidatePath("/dashboard/operations/damage-reports");
  return { ok: true, redirectTo: `/dashboard/operations/damage-reports` };
}

// -----------------------------------------------------------------------------
// Stage 7.F.A.2 — Maintenance ticket staff assignment.
//
// `maintenance_tickets` has no `assigned_to` column. The schema instead
// stores `task_id` — a nullable reference to `operation_tasks`, which DOES
// carry `assigned_to`. Assignment therefore bridges:
//   - If the ticket has no linked task → create one with the assignee.
//   - If the ticket has a linked task → update its `assigned_to`.
// In both cases the ticket's `task_id` ends up populated + the operation
// task carries the canonical assignment.
// -----------------------------------------------------------------------------

export async function assignMaintenanceTicketAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.assign");
  const parsed = assignMaintenanceTicketSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [ticket] = await db
    .select()
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, parsed.data.ticketId))
    .limit(1);
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (!(await ticketBelongsToOrg(db, ticket, organizationId))) {
    return { ok: false, error: "Ticket not found." };
  }
  if (ticket.status === "archived") {
    return { ok: false, error: "Cannot assign an archived ticket." };
  }

  const scheduledFor =
    parsed.data.scheduledFor && parsed.data.scheduledFor !== ""
      ? parsed.data.scheduledFor
      : null;

  if (ticket.taskId) {
    const [task] = await db
      .select()
      .from(operationTasks)
      .where(
        and(
          eq(operationTasks.id, ticket.taskId),
          eq(operationTasks.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!task) return { ok: false, error: "Linked task not found." };
    await db
      .update(operationTasks)
      .set({
        assignedTo: parsed.data.assigneeId,
        scheduledFor: scheduledFor ?? task.scheduledFor,
        status: task.status === "open" ? "scheduled" : task.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(operationTasks.id, ticket.taskId),
          eq(operationTasks.organizationId, organizationId),
        ),
      );
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "operations.maintenance.assign",
      entityType: "maintenance_ticket",
      entityId: ticket.id,
      before: { taskId: ticket.taskId, assignedTo: task.assignedTo },
      after: {
        taskId: ticket.taskId,
        assignedTo: parsed.data.assigneeId,
        scheduledFor,
      },
    });
  } else {
    const counter = await nextDailyCounter("OPS");
    const taskCode = buildTaskCode(counter);
    const [newTask] = await db
      .insert(operationTasks)
      .values({
        organizationId,
        taskCode,
        title: ticket.title,
        description: ticket.description ?? null,
        category: "maintenance",
        // ticket.severity is p0-p3 (mig 0116); operation_tasks.priority
        // keeps the generic low/normal/high/urgent scale — map across.
        priority:
          ticket.severity === "p0"
            ? "urgent"
            : ticket.severity === "p1"
              ? "high"
              : ticket.severity === "p3"
                ? "low"
                : "normal",
        source: "system",
        villaId: ticket.villaId ?? null,
        projectId: ticket.projectId ?? null,
        bookingId: ticket.bookingId ?? null,
        assignedTo: parsed.data.assigneeId,
        scheduledFor,
        createdBy: me?.id ?? null,
        status: "scheduled",
      })
      .returning({ id: operationTasks.id });
    await db
      .update(maintenanceTickets)
      .set({ taskId: newTask.id, updatedAt: new Date() })
      .where(eq(maintenanceTickets.id, ticket.id));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "operations.maintenance.assign",
      entityType: "maintenance_ticket",
      entityId: ticket.id,
      before: { taskId: null, assignedTo: null },
      after: {
        taskId: newTask.id,
        assignedTo: parsed.data.assigneeId,
        scheduledFor,
      },
    });
  }

  revalidatePath("/dashboard/operations/maintenance");
  revalidatePath(`/dashboard/operations/maintenance/${ticket.id}`);
  return { ok: true };
}

// =============================================================================
// Stage 10.E.2 — Edit + archive for preventive schedules + service requests.
//
// Audit found these 2 list pages with Add but no Edit/Delete. Schedule
// edits are full re-validation (frequency / next-due may change);
// archive flips status to "archived" (already supported by the existing
// status text column). Service-request edit is restricted to title /
// message / priority — operator-led adjustments before acceptance.
// =============================================================================

interface OpsIdInput {
  id: string;
}

export async function editPreventiveScheduleAction(
  input: OpsIdInput,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createPreventiveScheduleSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;
  const [row] = await db
    .update(preventiveSchedules)
    .set({
      name: d.name,
      category: d.category,
      villaId: d.villaId ?? null,
      projectId: d.projectId ?? null,
      taskTypeId: d.taskTypeId ?? null,
      checklistTemplateId: d.checklistTemplateId ?? null,
      frequency: d.frequency,
      intervalDays: d.intervalDays ?? null,
      nextDueOn: d.nextDueOn,
      priority: d.priority,
      assignedTo: d.assignedTo ?? null,
      updatedAt: new Date(),
    })
    .where(eq(preventiveSchedules.id, input.id))
    .returning({ id: preventiveSchedules.id });
  if (!row) return { ok: false, error: "Schedule not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.preventive.update",
    entityType: "preventive_schedule",
    entityId: input.id,
    after: { name: d.name, frequency: d.frequency, nextDueOn: d.nextDueOn },
  });
  revalidatePath("/dashboard/operations/preventive");
  return { ok: true };
}

export async function archivePreventiveScheduleAction(
  input: OpsIdInput,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(preventiveSchedules)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(preventiveSchedules.id, input.id))
    .returning({ id: preventiveSchedules.id });
  if (!row) return { ok: false, error: "Schedule not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.preventive.archive",
    entityType: "preventive_schedule",
    entityId: input.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/operations/preventive");
  return { ok: true };
}

export async function editServiceRequestAction(
  input: OpsIdInput,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createServiceRequestSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;
  // Service request edit is restricted to operator-controllable fields —
  // title / message / priority / requestType. Status transitions go
  // through accept/complete actions, never plain edit.
  const [row] = await db
    .update(serviceRequests)
    .set({
      title: d.title,
      message: d.message && d.message !== "" ? d.message : null,
      requestType: d.requestType,
      priority: d.priority,
      preferredTime:
        d.preferredTime && d.preferredTime !== "" ? new Date(d.preferredTime) : null,
      updatedAt: new Date(),
    })
    .where(eq(serviceRequests.id, input.id))
    .returning({ id: serviceRequests.id });
  if (!row) return { ok: false, error: "Service request not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.service_request.update",
    entityType: "service_request",
    entityId: input.id,
    after: { title: d.title, requestType: d.requestType, priority: d.priority },
  });
  revalidatePath("/dashboard/operations/service-requests");
  return { ok: true };
}

export async function archiveServiceRequestAction(
  input: OpsIdInput,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(serviceRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(serviceRequests.id, input.id))
    .returning({ id: serviceRequests.id });
  if (!row) return { ok: false, error: "Service request not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.service_request.archive",
    entityType: "service_request",
    entityId: input.id,
    after: { status: "cancelled" },
  });
  revalidatePath("/dashboard/operations/service-requests");
  return { ok: true };
}

/**
 * New backend — create a checklist template WITH its items in one call.
 * A template with zero items is useless (instantiateChecklistFromTemplate
 * copies items), so this inserts the header + ≥1 item atomically. The
 * `key` column is UNIQUE — duplicate keys return a friendly error.
 */
export async function createChecklistTemplateAction(
  input: CreateChecklistTemplateInput,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = createChecklistTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  try {
    const [tpl] = await db
      .insert(checklistTemplates)
      .values({
        key: d.key,
        name: d.name,
        category: d.category,
        description: d.description ?? null,
        villaType: d.villaType ?? null,
      })
      .returning({ id: checklistTemplates.id });

    await db.insert(checklistTemplateItems).values(
      d.items.map((it, i) => ({
        templateId: tpl.id,
        section: it.section,
        label: it.label,
        itemType: it.itemType,
        isRequired: it.isRequired,
        sortOrder: i,
      })),
    );

    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "operations.checklist_template.create",
      entityType: "checklist_template",
      entityId: tpl.id,
      after: { key: d.key, name: d.name, items: d.items.length },
    });

    revalidatePath("/dashboard/operations/checklists");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed.";
    if (
      msg.includes("checklist_templates_key") ||
      msg.toLowerCase().includes("unique")
    ) {
      return { ok: false, error: `A template with key "${d.key}" already exists.` };
    }
    return { ok: false, error: msg };
  }
}
