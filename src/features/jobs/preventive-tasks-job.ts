import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  checklistTemplateItems,
  checklistTemplates,
  operationTasks,
  taskChecklistItems,
  taskChecklists,
  preventiveSchedules,
} from "@/lib/db/schema";
import { recordAuditEvent } from "@/features/audit/services";
import { computeNextDueOn, todayYmd } from "@/features/operations/scheduling";
import { templateItemRequiresPhoto } from "@/features/operations/checklists";
import { buildTaskCode } from "@/features/operations/codes";
import { nextDailyCounter } from "@/features/operations/services";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * Re-implementation of the v4 generateDuePreventiveTasksAction logic that
 * doesn't require a server-action permission gate (the cron route already
 * verified CRON_SECRET, the manual run path verifies via requirePermission
 * before calling through).
 */
export async function runPreventiveTasksJob(handle: JobRunHandle): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { schedulesChecked: 0 },
      error: "DB unavailable",
    };
  }

  const today = todayYmd();
  const due = await db
    .select()
    .from(preventiveSchedules)
    .where(eq(preventiveSchedules.status, "active"));

  let schedulesChecked = 0;
  let tasksCreated = 0;
  let checklistsAttached = 0;
  let skipped = 0;
  let errors = 0;

  for (const s of due) {
    schedulesChecked++;
    if (s.nextDueOn > today) {
      skipped++;
      continue;
    }
    if (s.lastGeneratedOn === today) {
      skipped++;
      continue;
    }

    try {
      const counter = await nextDailyCounter("OPS");
      const taskCode = buildTaskCode(counter);

      const [task] = await db
        .insert(operationTasks)
        .values({
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
        const [tpl] = await db
          .select({ id: checklistTemplates.id })
          .from(checklistTemplates)
          .where(eq(checklistTemplates.id, s.checklistTemplateId))
          .limit(1);
        if (tpl) {
          const [cl] = await db
            .insert(taskChecklists)
            .values({ taskId: task.id, templateId: tpl.id, status: "open" })
            .returning({ id: taskChecklists.id });
          const items = await db
            .select()
            .from(checklistTemplateItems)
            .where(eq(checklistTemplateItems.templateId, tpl.id));
          if (items.length > 0) {
            await db.insert(taskChecklistItems).values(
              items.map((it) => ({
                checklistId: cl.id,
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
          checklistsAttached++;
        }
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

      tasksCreated++;
      await handle.event("info", `Generated ${taskCode} from schedule ${s.name}`, {
        scheduleId: s.id,
        nextDueOn: next,
      });

      await recordAuditEvent({
        actorUserId: null,
        action: "operations.preventive.generate.cron",
        entityType: "preventive_schedule",
        entityId: s.id,
        after: { taskId: task.id, nextDueOn: next },
      });
    } catch (e) {
      errors++;
      const message = e instanceof Error ? e.message : "unknown error";
      await handle.event("error", `Schedule ${s.name} failed: ${message}`, {
        scheduleId: s.id,
      });
    }
  }

  const status =
    errors > 0 && tasksCreated > 0
      ? "partial_success"
      : errors > 0 && tasksCreated === 0
        ? "failed"
        : "success";

  return {
    status,
    summary: `Checked ${schedulesChecked} · created ${tasksCreated} · skipped ${skipped} · errors ${errors}`,
    metrics: {
      schedulesChecked,
      tasksCreated,
      checklistsAttached,
      skipped,
      errors,
    },
    error: errors > 0 ? `${errors} schedule(s) failed` : undefined,
  };
}
