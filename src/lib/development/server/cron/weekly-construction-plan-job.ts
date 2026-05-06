import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { runAgent } from "../ai/agent-runner";
import { buildWeeklyPlan } from "../ai/weekly-construction-plan/weekly-plan-helpers";

/**
 * Stage 5.D — Weekly Construction Plan (Sunday 18:00).
 *
 * For each active project, generates a forward-looking weekly plan
 * for review by the PM. Idempotent in spirit — Sunday-only schedule.
 */
export async function runDevOsWeeklyConstructionPlan(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { generated: 0 },
      error: "DB unavailable",
    };
  }

  const projRows = await db.execute<{ id: string; name: string }>(sql`
    SELECT id::text, name FROM projects
     WHERE status NOT IN ('completed', 'paused', 'archived')
     LIMIT 50
  `);
  const projects =
    (projRows as unknown as { rows: Array<{ id: string; name: string }> })
      .rows ?? [];

  let generated = 0;
  const now = new Date();
  // Compute next Monday as week-start anchor.
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(
    now.getUTCDate() + ((1 + 7 - now.getUTCDay()) % 7 || 7),
  );
  nextMonday.setUTCHours(0, 0, 0, 0);

  for (const p of projects) {
    const result = await runAgent({
      agentKey: "weekly_plan",
      projectId: p.id,
      invocationType: "cron_recurring",
      buildOutput: async () => {
        const out = buildWeeklyPlan({
          weekStart: nextMonday,
          projectName: p.name,
          criticalPathTasksNext4Weeks: [],
          resourceUtilizationByRole: [],
          pendingMaterialDeliveries: [],
        });
        return {
          outputCategory: "weekly_plan",
          title: `Weekly plan — ${p.name} (${out.weekLabel})`,
          summary: `Plan for ${out.weekLabel}: ${out.criticalPathPriorities.length} CP task(s), ${out.materialBlockers.length} material blocker(s).`,
          detailedOutput: out,
          recommendedActions: out.recommendedAdjustments,
          confidenceLevel: "medium",
        };
      },
    });
    if (result.ok) generated++;
  }

  await handle.event("info", `weekly plan persisted for ${generated} project(s)`, {
    projectCount: generated,
  });

  return {
    status: "success",
    summary: `Generated weekly plan for ${generated} project(s).`,
    metrics: { generated, projectsScanned: projects.length },
  };
}
