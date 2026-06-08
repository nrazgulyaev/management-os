import "server-only";

import { getDb } from "@/lib/db/client";

import { generateOperationsCopilotSummary } from "@/features/ai/operations-copilot/service";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * v8B — refresh the AI Operations Co-pilot daily summary. Disabled by
 * default in `definitions.ts`; only runs when explicitly invoked
 * (manual run-now) or when the operator flips `enabled = true`.
 *
 * The job NEVER throws — `generateOperationsCopilotSummary` always
 * returns *some* summary (deterministic fallback when AI is off / fails),
 * so the worst-case outcome is "fallback" status with an error message.
 */
export async function runAiOperationsSummaryJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { fallbackUsed: false },
      error: "DB unavailable",
    };
  }
  await handle.event("info", "Generating Operations Co-pilot summary…");
  const out = await generateOperationsCopilotSummary({
    triggerType: "scheduled",
  });
  const status: JobOutcome["status"] = "success";
  const summary =
    out.status === "succeeded"
      ? `AI summary generated in ${out.latencyMs}ms.`
      : `Fallback summary persisted (${out.errorMessage ?? "AI disabled"}).`;
  return {
    status,
    summary,
    metrics: {
      runId: out.runId,
      summaryId: out.summaryId,
      runStatus: out.status,
      latencyMs: out.latencyMs,
      fallbackUsed: out.fallbackUsed,
    },
  };
}
