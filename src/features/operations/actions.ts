"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, or } from "drizzle-orm";
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
  deleteChecklistTemplateSchema,
  editChecklistTemplateSchema,
  type EditChecklistTemplateInput,
  editDamageReportSchema,
  editMaintenanceTicketSchema,
  editOperationTaskSchema,
  resolveDamageReportSchema,
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
  DAMAGE_REPORT_TRANSITIONS,
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
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();

  // TENANCY: task_checklists has no organization_id; its only org anchor is
  // taskId -> operation_tasks.organizationId. The supplied taskId is
  // client-controlled, so verify it resolves to the caller's org BEFORE
  // instantiating a checklist against it — otherwise org A could attach a
  // checklist run onto org B's operation_task.
  const [task] = await db
    .select({ id: operationTasks.id })
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.id, parsed.data.taskId),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!task) return { ok: false, error: "Task not found." };

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
  const organizationId = await requireOrgId();

  // TENANCY: task_checklist_items / task_checklists have no organization_id;
  // their only org anchor is checklist.taskId -> operation_tasks.organizationId.
  // Resolve item -> checklist -> task and require the task belong to the
  // caller's org, otherwise org A could flip org B's checklist items.
  const [item] = await db
    .select({
      id: taskChecklistItems.id,
      checklistId: taskChecklistItems.checklistId,
      status: taskChecklistItems.status,
      notes: taskChecklistItems.notes,
      valueText: taskChecklistItems.valueText,
      valueNumber: taskChecklistItems.valueNumber,
    })
    .from(taskChecklistItems)
    .innerJoin(taskChecklists, eq(taskChecklists.id, taskChecklistItems.checklistId))
    .innerJoin(operationTasks, eq(operationTasks.id, taskChecklists.taskId))
    .where(
      and(
        eq(taskChecklistItems.id, parsed.data.itemId),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
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
  const organizationId = await requireOrgId();

  // TENANCY: task_checklists has no organization_id; its only org anchor is
  // taskId -> operation_tasks.organizationId. Resolve checklist -> task and
  // require the task belong to the caller's org so org A can't complete org
  // B's checklist (which flips org B's operation_task to needs_review).
  const [checklist] = await db
    .select({
      id: taskChecklists.id,
      taskId: taskChecklists.taskId,
      status: taskChecklists.status,
    })
    .from(taskChecklists)
    .innerJoin(operationTasks, eq(operationTasks.id, taskChecklists.taskId))
    .where(
      and(
        eq(taskChecklists.id, parsed.data.checklistId),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
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
        eq(operationTasks.organizationId, organizationId),
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
  const organizationId = await requireOrgId();

  // TENANCY: task_checklists has no organization_id; its only org anchor is
  // taskId -> operation_tasks.organizationId. Resolve checklist -> task and
  // require the task belong to the caller's org so org A can't approve org
  // B's checklist (which flips org B's operation_task to approved).
  const [checklist] = await db
    .select({
      id: taskChecklists.id,
      taskId: taskChecklists.taskId,
      status: taskChecklists.status,
    })
    .from(taskChecklists)
    .innerJoin(operationTasks, eq(operationTasks.id, taskChecklists.taskId))
    .where(
      and(
        eq(taskChecklists.id, parsed.data.checklistId),
        eq(operationTasks.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(operationTasks.id, checklist.taskId),
        eq(operationTasks.organizationId, organizationId),
      ),
    );

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

  // TENANCY: preventive_schedules has no organization_id; its only org anchor
  // is villaId / projectId. Scope the due-schedule read to the caller's org
  // (same subquery pattern as listPreventiveSchedules) so this can't
  // materialise another tenant's schedules into operation_tasks stamped with
  // the caller's org.
  const due = await db
    .select()
    .from(preventiveSchedules)
    .where(
      and(
        eq(preventiveSchedules.status, "active"),
        or(
          inArray(
            preventiveSchedules.projectId,
            db
              .select({ id: projects.id })
              .from(projects)
              .where(eq(projects.organizationId, organizationId)),
          ),
          inArray(
            preventiveSchedules.villaId,
            db
              .select({ id: villas.id })
              .from(villas)
              .innerJoin(projects, eq(projects.id, villas.projectId))
              .where(eq(projects.organizationId, organizationId)),
          ),
        )!,
      ),
    );

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

export async function cancelServiceRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return transitionServiceRequest(formData, "cancelled");
}

/**
 * TENANCY: `service_requests` has no organization_id column — its only org
 * anchors are the (nullable) villaId / bookingId / taskId. Resolve the row's
 * owning org transitively (villa -> project, else booking, else linked task)
 * and return true only when it matches the caller's org. All-null / mismatch
 * is treated as not found so a cross-org operator can't transition the row.
 */
async function serviceRequestBelongsToOrg(
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
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Service request not found." };
  if (!(await serviceRequestBelongsToOrg(db, before, organizationId))) {
    return { ok: false, error: "Service request not found." };
  }
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

/**
 * Resolve / close a damage report. Closes the open → under_review →
 * {repaired|charged|waived|closed} lifecycle that previously dead-ended at
 * "open", recording the actual repair/charge cost. The transition is guarded
 * by DAMAGE_REPORT_TRANSITIONS (same `canTransition` helper as tasks /
 * maintenance) so an operator can't skip the review flow. Org-scoped via the
 * same transitive resolver (villa→project / booking / task) used by the edit
 * + archive damage actions.
 */
export async function resolveDamageReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = resolveDamageReportSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
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
    return { ok: false, error: "Cannot resolve an archived report." };
  }
  if (!canTransition(DAMAGE_REPORT_TRANSITIONS, before.status, d.status)) {
    return {
      ok: false,
      error: `Cannot move damage report from "${before.status}" to "${d.status}".`,
    };
  }

  await db
    .update(damageReports)
    .set({
      status: d.status,
      // Only overwrite the recorded cost when the operator supplies one —
      // a status-only move keeps the prior actual cost intact.
      actualCostMinor:
        d.actualCostMinor !== undefined ? d.actualCostMinor : before.actualCostMinor,
      updatedAt: new Date(),
    })
    .where(eq(damageReports.id, d.id));

  const finalCost =
    d.actualCostMinor !== undefined ? d.actualCostMinor : before.actualCostMinor;
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.damage.resolve",
    entityType: "damage_report",
    entityId: d.id,
    // bigint isn't JSON-serializable — stringify for the JSONB audit payload.
    before: {
      status: before.status,
      actualCostMinor:
        before.actualCostMinor != null ? before.actualCostMinor.toString() : null,
    },
    after: {
      status: d.status,
      actualCostMinor: finalCost != null ? finalCost.toString() : null,
    },
  });

  revalidatePath("/dashboard/operations/damage-reports");
  return { ok: true };
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

/**
 * Edit a checklist template — update the header (name / category /
 * description / villaType) AND fully replace its item set. The unique `key`
 * is intentionally immutable (it anchors preventive-schedule references), so
 * it's omitted from the edit schema. Items are replaced wholesale: delete the
 * old template-item rows, re-insert the new ones. Existing task_checklists
 * already snapshot their items at instantiation time, so replacing the
 * template's items never mutates in-flight runs.
 */
export async function editChecklistTemplateAction(
  input: EditChecklistTemplateInput,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = editChecklistTemplateSchema.safeParse(input);
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

  const [before] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, d.id))
    .limit(1);
  if (!before) return { ok: false, error: "Template not found." };
  if (before.status === "archived") {
    return { ok: false, error: "Cannot edit an archived template." };
  }

  await db
    .update(checklistTemplates)
    .set({
      name: d.name,
      category: d.category,
      description: d.description ?? null,
      villaType: d.villaType ?? null,
      updatedAt: new Date(),
    })
    .where(eq(checklistTemplates.id, d.id));

  // Replace the item set wholesale.
  await db
    .delete(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, d.id));
  await db.insert(checklistTemplateItems).values(
    d.items.map((it, i) => ({
      templateId: d.id,
      section: it.section,
      label: it.label,
      itemType: it.itemType,
      isRequired: it.isRequired,
      sortOrder: i,
    })),
  );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.checklist_template.edit",
    entityType: "checklist_template",
    entityId: d.id,
    before: { name: before.name, category: before.category },
    after: { name: d.name, category: d.category, items: d.items.length },
  });

  revalidatePath("/dashboard/operations/checklists");
  return { ok: true };
}

/**
 * Delete a checklist template. Hard delete is blocked if ANY task_checklist
 * run was instantiated from it (those runs keep `template_id`); in that case
 * the template is soft-archived (status → "archived") so it drops out of the
 * active library without orphaning history. With zero runs it's safe to hard
 * delete (its template-items cascade away).
 */
export async function deleteChecklistTemplateAction(
  input: { id: string },
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const parsed = deleteChecklistTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const { id } = parsed.data;

  const [before] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, id))
    .limit(1);
  if (!before) return { ok: false, error: "Template not found." };

  const [run] = await db
    .select({ id: taskChecklists.id })
    .from(taskChecklists)
    .where(eq(taskChecklists.templateId, id))
    .limit(1);

  if (run) {
    // Runs exist — soft-archive instead of hard delete to preserve history.
    if (before.status === "archived") {
      return { ok: false, error: "Template is already archived." };
    }
    await db
      .update(checklistTemplates)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(checklistTemplates.id, id));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "operations.checklist_template.archive",
      entityType: "checklist_template",
      entityId: id,
      before: { status: before.status },
      after: { status: "archived" },
    });
    revalidatePath("/dashboard/operations/checklists");
    return { ok: true };
  }

  // No runs — safe hard delete (template_items cascade via FK).
  await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.checklist_template.delete",
    entityType: "checklist_template",
    entityId: id,
    before: { key: before.key, name: before.name },
    after: null,
  });
  revalidatePath("/dashboard/operations/checklists");
  return { ok: true };
}
