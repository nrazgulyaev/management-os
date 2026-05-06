import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import {
  processPendingExportRequests,
  deleteExpiredExports,
} from "@/lib/development/server/data-export/data-export-actions";

/**
 * Stage 5.J — processes queued data export requests and clears
 * download URLs whose 7-day TTL has passed. Both phases run in the
 * same job to keep the cron count contained.
 */
export async function runDevOsDataExportProcessor(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const processed = await processPendingExportRequests({ limit: 25 });
  const expired = await deleteExpiredExports();
  if (!processed.ok) {
    return {
      status: "failed",
      summary: processed.error ?? "Export processing failed",
      metrics: { processed: 0, failed: 0, expired: 0 },
      error: processed.error,
    };
  }
  return {
    status: "success",
    summary:
      `Processed ${processed.processed} export request(s), ` +
      `${processed.failed} failed, expired ${expired.ok ? expired.pruned : 0} download URL(s).`,
    metrics: {
      processed: processed.processed,
      failed: processed.failed,
      expired: expired.ok ? expired.pruned : 0,
    },
  };
}
