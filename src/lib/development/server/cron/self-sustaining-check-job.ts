import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { developmentProjectMeta } from "@/lib/db/schema/development";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { evaluateSelfSustainingThreshold } from "../self-sustaining";

/**
 * For each project with a `development_project_meta` row, evaluates the
 * Self-Sustaining Threshold (90-day rolling net cash flow > 0) and:
 *
 *   - Updates `is_self_sustaining` and `last_self_sustaining_check_at`.
 *   - If the boolean flipped (was-false → now-true), fires
 *     `project_self_sustaining_reached`.
 *   - If it flipped the other way (was-true → now-false), fires
 *     `project_self_sustaining_lost`.
 *
 * Idempotent: same input produces same output; no-op if no projects
 * have meta rows yet. The notification only fires on transitions, so
 * running this job nightly does not spam.
 */
export async function runDevOsSelfSustainingCheck(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { evaluated: 0 },
      error: "DB unavailable",
    };
  }

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      metaId: developmentProjectMeta.id,
      currentlySustaining: developmentProjectMeta.isSelfSustaining,
    })
    .from(projects)
    .innerJoin(
      developmentProjectMeta,
      eq(developmentProjectMeta.projectId, projects.id),
    );

  let evaluated = 0;
  let crossed = 0;
  let uncrossed = 0;

  for (const p of projectRows) {
    const result = await evaluateSelfSustainingThreshold(p.id);
    evaluated += 1;
    const wasSustaining = !!p.currentlySustaining;
    const isSustaining = result.isThresholdMet;

    await db
      .update(developmentProjectMeta)
      .set({
        isSelfSustaining: isSustaining,
        lastSelfSustainingCheckAt: new Date(result.evaluatedAt),
        updatedAt: new Date(),
      })
      .where(eq(developmentProjectMeta.id, p.metaId));

    if (!wasSustaining && isSustaining) {
      crossed += 1;
      await handle.event("info", "project_self_sustaining_reached", {
        projectId: p.id,
        projectName: p.name,
        netCashFlowUsdMinor: result.netCashFlowUsdMinor,
        windowDays: result.evaluationPeriodDays,
      });
    } else if (wasSustaining && !isSustaining) {
      uncrossed += 1;
      await handle.event("warning", "project_self_sustaining_lost", {
        projectId: p.id,
        projectName: p.name,
        netCashFlowUsdMinor: result.netCashFlowUsdMinor,
        windowDays: result.evaluationPeriodDays,
      });
    }
  }

  return {
    status: "success",
    summary: `Evaluated ${evaluated} projects (${crossed} newly self-sustaining, ${uncrossed} lost the threshold).`,
    metrics: { evaluated, crossed, uncrossed },
  };
}
