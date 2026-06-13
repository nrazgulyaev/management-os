"use server";

import { revalidatePath } from "next/cache";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  maintenanceTemplates,
  villaMaintenancePlans,
  maintenanceWindowSuggestions,
  maintenanceRiskEvents,
} from "@/lib/db/schema/maintenance-intelligence";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { operationTasks } from "@/lib/db/schema/operations";
import { villas } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { nextDailyCounter } from "@/features/operations/services";
import { calculateNextDueAt, type Frequency } from "./scheduling-pure";
import {
  acceptSuggestionSchema,
  acknowledgeRiskSchema,
  createMaintenanceTemplateSchema,
  createVillaMaintenancePlanSchema,
  generateTaskFromPlanSchema,
  planIdSchema,
  resolveRiskSchema,
  suggestWindowsSchema,
} from "./schema";
import { suggestMaintenanceWindows } from "./scheduling";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

function parseTemplateForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    key: raw.key,
    name: raw.name,
    category: raw.category,
    defaultFrequency: raw.defaultFrequency || "monthly",
    defaultIntervalDays: raw.defaultIntervalDays
      ? Number(raw.defaultIntervalDays)
      : null,
    defaultDurationMinutes: raw.defaultDurationMinutes
      ? Number(raw.defaultDurationMinutes)
      : 60,
    defaultPriority: raw.defaultPriority || "normal",
    canBeDoneWhileOccupied:
      raw.canBeDoneWhileOccupied === "on" ||
      raw.canBeDoneWhileOccupied === "true",
    guestDisruptionLevel: raw.guestDisruptionLevel || "low",
    requiresVillaEmpty:
      raw.requiresVillaEmpty === "on" || raw.requiresVillaEmpty === "true",
    requiresOwnerVisibility:
      raw.requiresOwnerVisibility === "on" ||
      raw.requiresOwnerVisibility === "true",
    checklistTemplateId: raw.checklistTemplateId || null,
    description: raw.description || null,
  };
}

export async function createMaintenanceTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { templateId?: string }> {
  await requirePermission("maintenance_intelligence.write");
  const parsed = createMaintenanceTemplateSchema.safeParse(
    parseTemplateForm(formData),
  );
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(maintenanceTemplates)
    .values({
      key: parsed.data.key,
      name: parsed.data.name,
      category: parsed.data.category,
      defaultFrequency: parsed.data.defaultFrequency,
      defaultIntervalDays: parsed.data.defaultIntervalDays ?? null,
      defaultDurationMinutes: parsed.data.defaultDurationMinutes,
      defaultPriority: parsed.data.defaultPriority,
      canBeDoneWhileOccupied: parsed.data.canBeDoneWhileOccupied ?? true,
      guestDisruptionLevel: parsed.data.guestDisruptionLevel,
      requiresVillaEmpty: parsed.data.requiresVillaEmpty ?? false,
      requiresOwnerVisibility: parsed.data.requiresOwnerVisibility ?? false,
      checklistTemplateId: parsed.data.checklistTemplateId ?? null,
      description: parsed.data.description ?? null,
    })
    .returning({ id: maintenanceTemplates.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.template.create",
    entityType: "maintenance_template",
    entityId: row!.id,
    after: { key: parsed.data.key, name: parsed.data.name },
  });

  revalidatePath("/dashboard/maintenance-intelligence/templates");
  return { ok: true, templateId: row!.id };
}

// -----------------------------------------------------------------------------
// Plans
// -----------------------------------------------------------------------------

function parsePlanForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    villaId: raw.villaId,
    templateId: raw.templateId,
    planName: raw.planName,
    frequency: raw.frequency || "monthly",
    intervalDays: raw.intervalDays ? Number(raw.intervalDays) : null,
    durationMinutes: raw.durationMinutes ? Number(raw.durationMinutes) : 60,
    priority: raw.priority || "normal",
    canBeDoneWhileOccupied:
      raw.canBeDoneWhileOccupied === "on" ||
      raw.canBeDoneWhileOccupied === "true",
    guestDisruptionLevel: raw.guestDisruptionLevel || "low",
    requiresVillaEmpty:
      raw.requiresVillaEmpty === "on" || raw.requiresVillaEmpty === "true",
  };
}

export async function createVillaMaintenancePlanAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { planId?: string }> {
  await requirePermission("maintenance_intelligence.write");
  const parsed = createVillaMaintenancePlanSchema.safeParse(parsePlanForm(formData));
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [v] = await db
    .select({ projectId: villas.projectId })
    .from(villas)
    .where(eq(villas.id, parsed.data.villaId))
    .limit(1);

  // First due_at = now + interval (treat creation as "starts fresh").
  const nextDueAt = calculateNextDueAt({
    frequency: parsed.data.frequency as Frequency,
    intervalDays: parsed.data.intervalDays,
    lastCompletedAt: null,
  });

  const [row] = await db
    .insert(villaMaintenancePlans)
    .values({
      organizationId,
      villaId: parsed.data.villaId,
      projectId: v?.projectId ?? null,
      templateId: parsed.data.templateId,
      planName: parsed.data.planName,
      frequency: parsed.data.frequency,
      intervalDays: parsed.data.intervalDays ?? null,
      durationMinutes: parsed.data.durationMinutes,
      priority: parsed.data.priority,
      canBeDoneWhileOccupied: parsed.data.canBeDoneWhileOccupied ?? true,
      guestDisruptionLevel: parsed.data.guestDisruptionLevel,
      requiresVillaEmpty: parsed.data.requiresVillaEmpty ?? false,
      nextDueAt,
      createdBy: me?.id ?? null,
    })
    .returning({ id: villaMaintenancePlans.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.plan.create",
    entityType: "villa_maintenance_plan",
    entityId: row!.id,
    after: {
      villaId: parsed.data.villaId,
      templateId: parsed.data.templateId,
    },
  });

  revalidatePath("/dashboard/maintenance-intelligence/plans");
  return { ok: true, planId: row!.id };
}

export async function pauseVillaMaintenancePlanAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("maintenance_intelligence.write");
  const parsed = planIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing plan id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(villaMaintenancePlans)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(villaMaintenancePlans.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.plan.pause",
    entityType: "villa_maintenance_plan",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/maintenance-intelligence/plans");
  return { ok: true };
}

export async function archiveVillaMaintenancePlanAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("maintenance_intelligence.write");
  const parsed = planIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing plan id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(villaMaintenancePlans)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(villaMaintenancePlans.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.plan.archive",
    entityType: "villa_maintenance_plan",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/maintenance-intelligence/plans");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Suggestions
// -----------------------------------------------------------------------------

export async function suggestMaintenanceWindowsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { suggestions?: number }> {
  await requirePermission("maintenance_intelligence.generate");
  const parsed = suggestWindowsSchema.safeParse({
    planId: formData.get("planId"),
    horizonDays: formData.get("horizonDays")
      ? Number(formData.get("horizonDays"))
      : 14,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const out = await suggestMaintenanceWindows(
    parsed.data.planId,
    parsed.data.horizonDays,
  );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.suggestions.refresh",
    entityType: "villa_maintenance_plan",
    entityId: parsed.data.planId,
    after: { count: out.suggestions.length },
  });
  revalidatePath(`/dashboard/maintenance-intelligence/plans/${parsed.data.planId}`);
  revalidatePath("/dashboard/maintenance-intelligence/windows");
  return { ok: true, suggestions: out.suggestions.length };
}

export async function acceptMaintenanceWindowSuggestionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { taskId?: string }> {
  await requirePermission("maintenance_intelligence.generate");
  const parsed = acceptSuggestionSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing suggestion id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Tenant scope: a foreign suggestion id must read as "not found" before any
  // task/block/plan mutation.
  const [s] = await db
    .select()
    .from(maintenanceWindowSuggestions)
    .where(
      and(
        eq(maintenanceWindowSuggestions.id, parsed.data.id),
        eq(maintenanceWindowSuggestions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!s) return { ok: false, error: "Suggestion not found." };
  if (s.status !== "suggested")
    return {
      ok: false,
      error: `Suggestion is ${s.status}, can't accept.`,
    };

  // Generate the task at the suggested start (org-scoped: refuses a plan in
  // another org even if the suggestion row were somehow cross-linked).
  const result = await generateTaskFromPlan(
    s.villaMaintenancePlanId,
    s.suggestedStart.toISOString(),
    me?.id ?? null,
    organizationId,
  );
  if (!result.ok) return { ok: false, error: result.reason ?? "task generation failed" };

  await db
    .update(maintenanceWindowSuggestions)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(
      and(
        eq(maintenanceWindowSuggestions.id, parsed.data.id),
        eq(maintenanceWindowSuggestions.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.suggestion.accept",
    entityType: "maintenance_window_suggestion",
    entityId: parsed.data.id,
    after: { taskId: result.taskId, planId: s.villaMaintenancePlanId },
  });

  revalidatePath(
    `/dashboard/maintenance-intelligence/plans/${s.villaMaintenancePlanId}`,
  );
  revalidatePath("/dashboard/maintenance-intelligence/windows");
  return { ok: true, taskId: result.taskId };
}

// -----------------------------------------------------------------------------
// Task generation (used by both manual + batch endpoints)
// -----------------------------------------------------------------------------

interface GenerateOutcome {
  ok: boolean;
  taskId?: string;
  reason?: string;
}

/**
 * Internal: create an `operation_tasks` row from a maintenance plan,
 * advance the plan's `next_due_at`, and (when the plan requires the
 * villa empty or the disruption level is medium/high) materialise a
 * `maintenance_block` calendar block.
 */
export async function generateTaskFromPlan(
  planId: string,
  suggestedStartIso: string | null,
  actorUserId: string | null,
  // TENANCY: when called from a request path, the caller passes its resolved
  // org so a foreign-org plan reads as "not found" before any task/block/plan
  // mutation. System/batch callers that have already org-scoped their plan
  // selection can pass null.
  expectedOrgId: string | null = null,
): Promise<GenerateOutcome> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no db" };
  const [plan] = await db
    .select()
    .from(villaMaintenancePlans)
    .where(
      expectedOrgId
        ? and(
            eq(villaMaintenancePlans.id, planId),
            eq(villaMaintenancePlans.organizationId, expectedOrgId),
          )
        : eq(villaMaintenancePlans.id, planId),
    )
    .limit(1);
  if (!plan) return { ok: false, reason: "plan not found" };
  if (plan.status !== "active")
    return { ok: false, reason: `plan is ${plan.status}` };

  const start = suggestedStartIso
    ? new Date(suggestedStartIso)
    : (plan.nextDueAt ?? new Date());
  const end = new Date(start.getTime() + plan.durationMinutes * 60_000);
  const scheduledFor = start.toISOString().slice(0, 10);

  // Mint a task code via the existing counter helper (MNT-YYYYMMDD-NNN).
  const seq = await nextDailyCounter("MNT");
  const ymd = scheduledFor.replace(/-/g, "");
  const taskCode = `MNT-${ymd}-${String(seq).padStart(3, "0")}`;

  const [task] = await db
    .insert(operationTasks)
    .values({
      organizationId: plan.organizationId,
      taskCode,
      villaId: plan.villaId,
      projectId: plan.projectId,
      title: `Preventive · ${plan.planName}`,
      description: `Generated from plan ${plan.id.slice(0, 8)}.`,
      category: "maintenance",
      priority: plan.priority,
      status: "open",
      source: "preventive",
      scheduledFor,
      dueAt: start,
      estimatedMinutes: plan.durationMinutes,
      ownerVisible: false,
      guestVisible: false,
      createdBy: actorUserId,
    })
    .returning({ id: operationTasks.id });

  // Optional calendar block when the plan needs the villa empty / medium+ disruption.
  if (
    plan.requiresVillaEmpty ||
    plan.guestDisruptionLevel === "medium" ||
    plan.guestDisruptionLevel === "high"
  ) {
    await db.insert(villaCalendarBlocks).values({
      organizationId: plan.organizationId,
      villaId: plan.villaId,
      projectId: plan.projectId,
      blockType: "maintenance_block",
      sourceType: "operation_task",
      sourceId: task!.id,
      startsAt: start,
      endsAt: end,
      title: `Preventive · ${plan.planName}`,
      status: "active",
      ownerVisible: true,
      guestVisible: false,
      createdBy: actorUserId,
    });
  }

  // Advance plan's next_due_at.
  const next = calculateNextDueAt({
    frequency: plan.frequency as Frequency,
    intervalDays: plan.intervalDays,
    lastCompletedAt: start,
  });
  await db
    .update(villaMaintenancePlans)
    .set({
      nextDueAt: next,
      lastGeneratedTaskId: task!.id,
      updatedAt: new Date(),
    })
    .where(
      expectedOrgId
        ? and(
            eq(villaMaintenancePlans.id, planId),
            eq(villaMaintenancePlans.organizationId, expectedOrgId),
          )
        : eq(villaMaintenancePlans.id, planId),
    );

  return { ok: true, taskId: task!.id };
}

export async function generateMaintenanceTaskFromPlanAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { taskId?: string }> {
  await requirePermission("maintenance_intelligence.generate");
  const parsed = generateTaskFromPlanSchema.safeParse({
    planId: formData.get("planId"),
    suggestedStart: formData.get("suggestedStart") || null,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const out = await generateTaskFromPlan(
    parsed.data.planId,
    parsed.data.suggestedStart ?? null,
    me?.id ?? null,
    organizationId,
  );
  if (!out.ok) return { ok: false, error: out.reason ?? "task generation failed" };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.task.generate",
    entityType: "villa_maintenance_plan",
    entityId: parsed.data.planId,
    after: { taskId: out.taskId },
  });
  revalidatePath(`/dashboard/maintenance-intelligence/plans/${parsed.data.planId}`);
  revalidatePath("/dashboard/operations/tasks");
  return { ok: true, taskId: out.taskId };
}

/**
 * Batch: generate a task for every plan whose `next_due_at <= now`.
 * Useful as a manual trigger; a scheduled job can land later.
 */
export async function generateDueMaintenanceTasksAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { generated?: number }> {
  void _formData;
  await requirePermission("maintenance_intelligence.generate");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const now = new Date();
  // Tenant scope: the batch only sweeps the caller's own due plans.
  const due = await db
    .select({ id: villaMaintenancePlans.id })
    .from(villaMaintenancePlans)
    .where(
      and(
        eq(villaMaintenancePlans.organizationId, organizationId),
        eq(villaMaintenancePlans.status, "active"),
        lte(villaMaintenancePlans.nextDueAt, now),
      ),
    );
  let generated = 0;
  for (const p of due) {
    const out = await generateTaskFromPlan(p.id, null, me?.id ?? null, organizationId);
    if (out.ok) generated++;
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_intelligence.tasks.generate_batch",
    entityType: "villa_maintenance_plan",
    entityId: null,
    after: { checked: due.length, generated },
  });
  revalidatePath("/dashboard/maintenance-intelligence/plans");
  revalidatePath("/dashboard/operations/tasks");
  return { ok: true, generated };
}

// -----------------------------------------------------------------------------
// Risk events
// -----------------------------------------------------------------------------

export async function acknowledgeRiskEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("maintenance_risk.manage");
  const parsed = acknowledgeRiskSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing risk id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(maintenanceRiskEvents)
    .set({ status: "acknowledged" })
    .where(eq(maintenanceRiskEvents.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_risk.acknowledge",
    entityType: "maintenance_risk_event",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/maintenance-intelligence/risks");
  return { ok: true };
}

export async function resolveRiskEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("maintenance_risk.manage");
  const parsed = resolveRiskSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: "Missing risk id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(maintenanceRiskEvents)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(maintenanceRiskEvents.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_risk.resolve",
    entityType: "maintenance_risk_event",
    entityId: parsed.data.id,
    after: { notes: parsed.data.notes ?? null },
  });
  revalidatePath("/dashboard/maintenance-intelligence/risks");
  return { ok: true };
}

// COMPLETE-1 fix: a `"use server"` file may only export async
// functions. The previous `export const _drizzle = { inArray }` was a
// dev-only unused-import shim that worked under Next 14 but crashes
// Next 15 prod builds with `A "use server" file can only export
// async functions, found object` — surfacing as a 500 on any page
// that imports a real action from this file (e.g.
// /dashboard/maintenance-intelligence/templates). The `inArray`
// import is now consumed inside this file's action bodies, so the
// shim is unnecessary.
