"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  projectTasks,
  taskDependencies,
  workPackages,
} from "@/lib/db/schema/work-packages";
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
