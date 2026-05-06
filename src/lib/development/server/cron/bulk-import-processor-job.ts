import "server-only";

import { eq, and, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bulkImportJobs } from "@/lib/db/schema/bulk-import";
import { processBulkImportJob } from "@/lib/development/server/bulk-import/import-actions";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P0.7-B.2 — Bulk import processor cron.
 *
 * Picks ready/processing rows that haven't completed yet and runs ONE
 * batch through `processBulkImportJob()`. Each batch is 1000 rows
 * (defined inside the action). Multi-batch jobs naturally complete
 * across multiple cron firings; the action's idempotent
 * processedRows-resume logic handles this correctly.
 *
 * Tier-1 scope (MVP):
 *   - Picks at most `MAX_JOBS_PER_RUN` due jobs per firing
 *   - Calls processBulkImportJob() per job (one batch each)
 *   - Skips jobs with no `source_content` (validate or upload bug)
 *
 * Idempotent at multiple layers:
 *   - cron handler holds a job lock (acquireJobLock in the dispatcher)
 *   - processBulkImportJob is itself idempotent on processedRows
 *   - returning a `processing` job to the queue lets the next firing
 *     pick up the next batch
 */

const MAX_JOBS_PER_RUN = 5;
const STUCK_PROCESSING_GRACE_MIN = 10;

export async function runDevOsBulkImportProcessor(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { processed_jobs: 0 },
      error: "DB unavailable",
    };
  }

  // Eligible: status='ready' OR status='processing' that's been
  // sitting for >10 minutes (stuck — pick up where it left off).
  const stuckThreshold = new Date(
    Date.now() - STUCK_PROCESSING_GRACE_MIN * 60 * 1000,
  );

  const dueJobs = await db
    .select({ id: bulkImportJobs.id, status: bulkImportJobs.status })
    .from(bulkImportJobs)
    .where(
      and(
        inArray(bulkImportJobs.status, ["ready", "processing"]),
        // Only pick processing rows that are stale, OR any ready row
        // (we model the OR by selecting then filtering in JS — simpler
        // than a complex SQL OR over different conditions per status).
        lt(bulkImportJobs.updatedAt, new Date()), // always true; simplification
      ),
    )
    .limit(MAX_JOBS_PER_RUN * 4); // overfetch + filter to stay simple

  const eligible: { id: string }[] = [];
  for (const j of dueJobs) {
    if (j.status === "ready") {
      eligible.push({ id: j.id });
    } else if (j.status === "processing") {
      // Refetch to check the updatedAt stale-ness
      const fresh = await db
        .select({ updatedAt: bulkImportJobs.updatedAt })
        .from(bulkImportJobs)
        .where(eq(bulkImportJobs.id, j.id))
        .limit(1);
      if (fresh[0] && fresh[0].updatedAt < stuckThreshold) {
        eligible.push({ id: j.id });
      }
    }
    if (eligible.length >= MAX_JOBS_PER_RUN) break;
  }

  if (eligible.length === 0) {
    return {
      status: "success",
      summary: "No bulk-import jobs ready for processing.",
      metrics: { processed_jobs: 0, completed: 0, failed: 0, still_processing: 0 },
    };
  }

  let completed = 0;
  let failed = 0;
  let stillProcessing = 0;
  for (const j of eligible) {
    const result = await processBulkImportJob({ jobId: j.id });
    if (!result.ok) {
      failed += 1;
      continue;
    }
    if (result.status === "completed") completed += 1;
    else if (result.status === "failed") failed += 1;
    else stillProcessing += 1;
  }

  return {
    status: "success",
    summary: `Processed ${eligible.length} bulk-import job(s): ${completed} completed, ${failed} failed, ${stillProcessing} need more batches.`,
    metrics: {
      processed_jobs: eligible.length,
      completed,
      failed,
      still_processing: stillProcessing,
    },
  };
}
