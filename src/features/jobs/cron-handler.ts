import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthFromRequest } from "./auth";
import { executeAllJobs, executeJob, type JobKey } from "./actions";
import { logger } from "@/lib/observability/logger";

export interface CronJsonResponse {
  ok: boolean;
  jobRunId?: string | null;
  status?: string;
  summary?: string;
  metrics?: Record<string, unknown> | null;
  error?: string;
}

/**
 * Shared handler used by every /api/cron/<job> route. Verifies auth,
 * runs the job, returns a JSON envelope. Never re-throws.
 */
export async function handleCronJobRequest(
  request: NextRequest,
  jobKey: JobKey,
): Promise<NextResponse<CronJsonResponse>> {
  const auth = verifyCronAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason ?? "unauthorised" }, { status: 401 });
  }
  if (auth.warnedLocalhostBypass) {
    console.warn(
      `[cron] CRON_SECRET unset — accepting localhost request for ${jobKey}. Configure CRON_SECRET before deploying.`,
    );
  }

  try {
    const { jobRunId, outcome } = await executeJob(jobKey, "cron", null);
    return NextResponse.json({
      ok: outcome.status !== "failed",
      jobRunId,
      status: outcome.status,
      summary: outcome.summary,
      metrics: outcome.metrics,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "uncaught error";
    logger.error("Cron job threw an uncaught error", {
      area: "cron.handler",
      jobKey,
      error: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function handleCronRunAllRequest(
  request: NextRequest,
): Promise<NextResponse> {
  const auth = verifyCronAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason ?? "unauthorised" }, { status: 401 });
  }
  if (auth.warnedLocalhostBypass) {
    console.warn(
      "[cron] CRON_SECRET unset — accepting localhost run-all. Configure CRON_SECRET before deploying.",
    );
  }
  const { results } = await executeAllJobs("cron", null);
  const allOk = results.every((r) => r.status !== "failed");
  return NextResponse.json({ ok: allOk, results });
}
