import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { requireDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  projectTasks,
  taskDependencies,
  workPackages,
} from "@/lib/db/schema/work-packages";

export async function listProjectTasks(filters?: {
  workPackageId?: string;
  projectId?: string;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  if (filters?.projectId) {
    // Filter via work_packages.project_id join.
    return db
      .select({
        id: projectTasks.id,
        taskCode: projectTasks.taskCode,
        name: projectTasks.name,
        workPackageId: projectTasks.workPackageId,
        plannedStart: projectTasks.plannedStart,
        plannedFinish: projectTasks.plannedFinish,
        durationDays: projectTasks.durationDays,
        actualStart: projectTasks.actualStart,
        actualFinish: projectTasks.actualFinish,
        progressPercentage: projectTasks.progressPercentage,
        status: projectTasks.status,
        isOnCriticalPath: projectTasks.isOnCriticalPath,
        earlyStart: projectTasks.earlyStart,
        earlyFinish: projectTasks.earlyFinish,
        lateStart: projectTasks.lateStart,
        lateFinish: projectTasks.lateFinish,
        totalFloatDays: projectTasks.totalFloatDays,
        cpLastComputedAt: projectTasks.cpLastComputedAt,
        responsibleUserId: projectTasks.responsibleUserId,
        vendorId: projectTasks.vendorId,
      })
      .from(projectTasks)
      .innerJoin(
        workPackages,
        eq(workPackages.id, projectTasks.workPackageId),
      )
      .where(
        and(
          eq(projectTasks.organizationId, organizationId),
          eq(workPackages.projectId, filters.projectId),
        ),
      )
      .orderBy(asc(projectTasks.plannedStart));
  }
  const conditions = [
    eq(projectTasks.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
  if (filters?.workPackageId) {
    conditions.push(eq(projectTasks.workPackageId, filters.workPackageId));
  }
  return db
    .select()
    .from(projectTasks)
    .where(and(...conditions))
    .orderBy(asc(projectTasks.plannedStart));
}

export async function getProjectTaskByCode(taskCode: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.taskCode, taskCode),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  // Cross-org code → null so the page notFound()s.
  return row ?? null;
}

/**
 * Resolve the owning project id + slug for a task, org-scoped. Used by the
 * task detail page to load sibling tasks for the add-dependency picker.
 */
export async function getTaskProjectRef(
  taskId: string,
): Promise<{ projectId: string } | null> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({ projectId: workPackages.projectId })
    .from(projectTasks)
    .innerJoin(workPackages, eq(workPackages.id, projectTasks.workPackageId))
    .where(
      and(
        eq(projectTasks.id, taskId),
        eq(projectTasks.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listTaskDependenciesForTasks(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  const db = requireDb();
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.organizationId, organizationId),
        or(
          inArray(taskDependencies.predecessorId, taskIds),
          inArray(taskDependencies.successorId, taskIds),
        ),
      ),
    );
}

/**
 * Lookahead: tasks starting within the next N days OR currently in progress.
 */
export async function lookaheadTasks(
  projectId: string,
  windowDays: number,
) {
  const db = requireDb();
  return db.execute(sql`
    SELECT
      t.id,
      t.task_code,
      t.name,
      t.planned_start::text,
      t.planned_finish::text,
      t.status,
      t.is_on_critical_path,
      t.progress_percentage::text
    FROM project_tasks t
    JOIN work_packages wp ON wp.id = t.work_package_id
    WHERE wp.project_id = ${projectId}
      AND (
        (t.planned_start <= CURRENT_DATE + (${windowDays}::int * INTERVAL '1 day')
         AND t.planned_finish >= CURRENT_DATE)
        OR t.status = 'in_progress'
      )
    ORDER BY t.is_on_critical_path DESC, t.planned_start ASC
  `).then((r) => rowsOf<Record<string, string | boolean>>(r));
}
