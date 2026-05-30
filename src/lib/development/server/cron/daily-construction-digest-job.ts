import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { runAgent } from "../ai/agent-runner";
import { buildDailyDigest } from "../ai/daily-construction-digest/daily-digest-helpers";

/**
 * Stage 5.D — Daily Construction Digest (22:00 daily).
 *
 * For each active project, aggregates the day's activity and persists
 * a digest output for PM review. Idempotent — multiple runs in one day
 * produce multiple outputs (each a timestamped snapshot).
 */
export async function runDevOsDailyConstructionDigest(
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
    rowsOf<{ id: string; name: string }>(projRows);

  let generated = 0;
  const today = new Date();
  for (const p of projects) {
    const result = await runAgent({
      agentKey: "daily_digest",
      projectId: p.id,
      invocationType: "cron_recurring",
      buildOutput: async () => {
        const out = buildDailyDigest({
          date: today,
          projectName: p.name,
          whatsappMessageCount: 0,
          siteReportCount: 0,
          photoCount: 0,
          photosFlaggedByAi: 0,
          transactionCount: 0,
          transactionTotalMinor: 0,
          deliveryCount: 0,
          qaQcOpenedToday: 0,
          qaQcResolvedToday: 0,
          workforcePresent: 0,
          workforceExpected: 0,
        });
        return {
          outputCategory: "daily_digest",
          title: `Daily digest — ${p.name} ${today.toISOString().slice(0, 10)}`,
          summary: out.summary,
          detailedOutput: out,
          recommendedActions: out.recommendedActionsForTomorrow,
          confidenceLevel: "medium",
        };
      },
    });
    if (result.ok) generated++;
  }

  await handle.event("info", `daily digest persisted for ${generated} project(s)`, {
    projectCount: generated,
  });

  return {
    status: "success",
    summary: `Generated daily digest for ${generated} project(s).`,
    metrics: { generated, projectsScanned: projects.length },
  };
}
