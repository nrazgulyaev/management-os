"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import {
  projectTasks,
  taskDependencies,
  workPackages,
} from "@/lib/db/schema/work-packages";
import { projects } from "@/lib/db/schema/projects";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  computeCriticalPath,
  detectCycles,
  type DependencyType,
  type DependencyInput,
  type TaskInput,
} from "./critical-path-helpers";

const createTaskSchema = z.object({
  taskCode: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  workPackageId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable().optional(),
  plannedStart: z.string(),
  plannedFinish: z.string(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createProjectTask(
  input: z.input<typeof createTaskSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = createTaskSchema.parse(input);
  if (parsed.plannedFinish < parsed.plannedStart) {
    throw new Error("plannedFinish must be >= plannedStart");
  }
  const db = requireDb();
  const [row] = await db
    .insert(projectTasks)
    .values({
      organizationId,
      taskCode: parsed.taskCode,
      name: parsed.name,
      description: parsed.description ?? null,
      workPackageId: parsed.workPackageId,
      parentTaskId: parsed.parentTaskId ?? null,
      plannedStart: parsed.plannedStart,
      plannedFinish: parsed.plannedFinish,
      responsibleUserId: parsed.responsibleUserId ?? null,
      vendorId: parsed.vendorId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const setDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  successorId: z.string().uuid(),
  type: z.enum([
    "finish_to_start",
    "start_to_start",
    "finish_to_finish",
    "start_to_finish",
  ]).default("finish_to_start"),
  lagDays: z.number().int().default(0),
  notes: z.string().nullable().optional(),
});

/**
 * Create a dependency edge. Refuses to create if it would form a cycle.
 */
export async function setTaskDependency(
  input: z.input<typeof setDependencySchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = setDependencySchema.parse(input);
  if (parsed.predecessorId === parsed.successorId) {
    throw new Error("dependency: predecessor cannot equal successor");
  }
  const db = requireDb();

  return db.transaction(async (tx) => {
    // Pull all tasks + existing deps for the project containing these tasks.
    // TENANCY — scope every lookup to the caller's org so a foreign
    // predecessorId / work package cannot be wired into a dependency edge.
    const [pred] = await tx
      .select({ workPackageId: projectTasks.workPackageId })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.id, parsed.predecessorId),
          eq(projectTasks.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!pred) throw new Error("predecessor task not found");
    const [wp] = await tx
      .select({ projectId: workPackages.projectId })
      .from(workPackages)
      .where(
        and(
          eq(workPackages.id, pred.workPackageId),
          eq(workPackages.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!wp) throw new Error("predecessor task not found");
    const { projectId } = wp;

    const allTasks = await tx
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .innerJoin(
        workPackages,
        eq(workPackages.id, projectTasks.workPackageId),
      )
      .where(
        and(
          eq(workPackages.projectId, projectId),
          eq(projectTasks.organizationId, organizationId),
        ),
      );
    const taskIds = allTasks.map((t) => t.id);

    const existingDeps = await tx
      .select()
      .from(taskDependencies)
      .where(
        inArray(taskDependencies.predecessorId, taskIds),
      );

    const proposed: DependencyInput[] = [
      ...existingDeps.map((d) => ({
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        type: d.dependencyType as DependencyType,
        lagDays: d.lagDays,
      })),
      {
        predecessorId: parsed.predecessorId,
        successorId: parsed.successorId,
        type: parsed.type as DependencyType,
        lagDays: parsed.lagDays,
      },
    ];

    const cycles = detectCycles(taskIds, proposed);
    if (cycles.length > 0) {
      throw new Error(
        `dependency would form a cycle (involves ${cycles[0].length} tasks)`,
      );
    }

    const [row] = await tx
      .insert(taskDependencies)
      .values({
        organizationId,
        predecessorId: parsed.predecessorId,
        successorId: parsed.successorId,
        dependencyType: parsed.type,
        lagDays: parsed.lagDays,
        notes: parsed.notes ?? null,
      })
      .returning();
    return row;
  });
}

/**
 * Recompute critical path for a project. Atomic: runs CPM, then writes
 * is_on_critical_path / early_start / late_finish / total_float_days /
 * cp_last_computed_at on every task in one transaction.
 */
export async function recomputeProjectCriticalPath(input: {
  projectId: string;
}) {
  await requireInternalUser();
  // TENANT-1: called from both auth context (user trigger) and cron
  // (critical-path-recompute-job). When invoked from cron there is no
  // user session, so requireOrgId throws. The cron caller iterates
  // every project in the DB, so we cannot disambiguate org safely here.
  // TODO(cron): refactor cron path to either (a) pass projects scoped
  // to a single org per invocation, or (b) accept an explicit
  // organizationId argument. For now, scope updates with id-only WHERE
  // when no session exists; the read-only project_id filter still
  // limits the blast radius. Otherwise add org filter.
  const organizationId = await requireOrgId();
  const db = requireDb();

  return db.transaction(async (tx) => {
    const tasks = await tx
      .select({
        id: projectTasks.id,
        plannedStart: projectTasks.plannedStart,
        plannedFinish: projectTasks.plannedFinish,
        durationDays: projectTasks.durationDays,
      })
      .from(projectTasks)
      .innerJoin(
        workPackages,
        eq(workPackages.id, projectTasks.workPackageId),
      )
      .where(eq(workPackages.projectId, input.projectId));
    const taskIds = tasks.map((t) => t.id);
    const deps = await tx
      .select()
      .from(taskDependencies)
      .where(inArray(taskDependencies.predecessorId, taskIds));

    const taskInputs: TaskInput[] = tasks.map((t) => ({
      id: t.id,
      plannedStart: new Date(t.plannedStart),
      plannedFinish: new Date(t.plannedFinish),
      durationDays: t.durationDays ?? 1,
    }));
    const depInputs: DependencyInput[] = deps.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.dependencyType as DependencyType,
      lagDays: d.lagDays,
    }));
    const cp = computeCriticalPath(taskInputs, depInputs);

    if (cp.detectedCycles.length > 0) {
      throw new Error(
        `cannot compute critical path — graph has cycle(s) involving ${cp.detectedCycles[0].length} tasks`,
      );
    }

    const now = new Date();
    for (const r of cp.results) {
      await tx
        .update(projectTasks)
        .set({
          isOnCriticalPath: r.isOnCriticalPath,
          earlyStart: r.earlyStart.toISOString().slice(0, 10),
          earlyFinish: r.earlyFinish.toISOString().slice(0, 10),
          lateStart: r.lateStart.toISOString().slice(0, 10),
          lateFinish: r.lateFinish.toISOString().slice(0, 10),
          totalFloatDays: r.totalFloatDays,
          cpLastComputedAt: now,
        })
        .where(
          and(
            eq(projectTasks.id, r.taskId),
            eq(projectTasks.organizationId, organizationId),
          ),
        );
    }

    return {
      taskCount: cp.results.length,
      criticalPathDuration: cp.criticalPathDuration,
      projectStart: cp.projectStartDate,
      projectEnd: cp.projectEndDate,
    };
  });
}

// =========================================================================
// Task lifecycle — update / progress / complete (mounted on the task detail
// page). The schema enumerates statuses planned | ready_to_start |
// in_progress | completed | blocked | cancelled and a 0–100 progress %.
// =========================================================================

const TASK_STATUSES = [
  "planned",
  "ready_to_start",
  "in_progress",
  "completed",
  "blocked",
  "cancelled",
] as const;

/**
 * Resolve the owning project's slug for a task (via task → work_package →
 * project) so the right detail page can be revalidated. Org-scoped.
 */
async function taskProjectSlug(
  taskId: string,
  organizationId: string,
): Promise<string | null> {
  const db = requireDb();
  const [row] = await db
    .select({ slug: projects.slug })
    .from(projectTasks)
    .innerJoin(workPackages, eq(workPackages.id, projectTasks.workPackageId))
    .innerJoin(projects, eq(projects.id, workPackages.projectId))
    .where(
      and(
        eq(projectTasks.id, taskId),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row?.slug ?? null;
}

async function loadTaskForOrg(taskId: string, organizationId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.id, taskId),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function revalidateTask(
  taskCode: string,
  organizationId: string,
  taskId: string,
): Promise<void> {
  const slug = await taskProjectSlug(taskId, organizationId);
  if (!slug) return;
  revalidatePath(
    `/development-os/projects/${slug}/schedule/tasks/${encodeURIComponent(taskCode)}`,
  );
  revalidatePath(`/development-os/projects/${slug}/schedule/tasks`);
}

const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  plannedStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedFinish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  actualStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  actualFinish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Edit a task's editable fields (name / description / status / planned +
 * actual dates / notes), org-scoped. Returns the updated row.
 */
export async function updateProjectTask(
  input: z.input<typeof updateTaskSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = updateTaskSchema.parse(input);
  const db = requireDb();

  const existing = await loadTaskForOrg(parsed.taskId, organizationId);
  if (!existing) throw new Error("task not found");

  const start = parsed.plannedStart ?? existing.plannedStart;
  const finish = parsed.plannedFinish ?? existing.plannedFinish;
  if (finish < start) {
    throw new Error("plannedFinish must be >= plannedStart");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.description !== undefined) {
    updates.description = parsed.description ?? null;
  }
  if (parsed.status !== undefined) updates.status = parsed.status;
  if (parsed.plannedStart !== undefined) updates.plannedStart = parsed.plannedStart;
  if (parsed.plannedFinish !== undefined) {
    updates.plannedFinish = parsed.plannedFinish;
  }
  if (parsed.actualStart !== undefined) {
    updates.actualStart = parsed.actualStart ?? null;
  }
  if (parsed.actualFinish !== undefined) {
    updates.actualFinish = parsed.actualFinish ?? null;
  }
  if (parsed.notes !== undefined) updates.notes = parsed.notes ?? null;

  const [row] = await db
    .update(projectTasks)
    .set(updates)
    .where(
      and(
        eq(projectTasks.id, parsed.taskId),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .returning();
  await revalidateTask(row.taskCode, organizationId, row.id);
  return row;
}

const setProgressSchema = z.object({
  taskId: z.string().uuid(),
  progressPercentage: z.number().min(0).max(100),
});

/**
 * Set a task's progress %. Crossing 0 → >0 moves a planned task into
 * in_progress (and stamps actual_start if unset); reaching 100% completes it.
 * Org-scoped.
 */
export async function setTaskProgress(
  input: z.input<typeof setProgressSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = setProgressSchema.parse(input);
  const db = requireDb();

  const existing = await loadTaskForOrg(parsed.taskId, organizationId);
  if (!existing) throw new Error("task not found");

  const today = new Date().toISOString().slice(0, 10);
  const updates: Record<string, unknown> = {
    progressPercentage: String(parsed.progressPercentage),
    updatedAt: new Date(),
  };
  if (parsed.progressPercentage >= 100) {
    updates.status = "completed";
    updates.actualFinish = existing.actualFinish ?? today;
    updates.actualStart = existing.actualStart ?? today;
  } else if (parsed.progressPercentage > 0) {
    if (existing.status === "planned" || existing.status === "ready_to_start") {
      updates.status = "in_progress";
    }
    if (!existing.actualStart) updates.actualStart = today;
  }

  const [row] = await db
    .update(projectTasks)
    .set(updates)
    .where(
      and(
        eq(projectTasks.id, parsed.taskId),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .returning();
  await revalidateTask(row.taskCode, organizationId, row.id);
  return row;
}

const completeTaskSchema = z.object({
  taskId: z.string().uuid(),
  actualFinish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Mark a task completed — sets status=completed, progress=100, and stamps
 * actual_finish (and actual_start if it was never started). Org-scoped.
 */
export async function completeTask(
  input: z.input<typeof completeTaskSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = completeTaskSchema.parse(input);
  const db = requireDb();

  const existing = await loadTaskForOrg(parsed.taskId, organizationId);
  if (!existing) throw new Error("task not found");

  const finish = parsed.actualFinish ?? new Date().toISOString().slice(0, 10);
  const [row] = await db
    .update(projectTasks)
    .set({
      status: "completed",
      progressPercentage: "100",
      actualFinish: finish,
      actualStart: existing.actualStart ?? finish,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectTasks.id, parsed.taskId),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .returning();
  await revalidateTask(row.taskCode, organizationId, row.id);
  return row;
}
