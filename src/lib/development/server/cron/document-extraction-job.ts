import "server-only";

import {
  extractFromDocument,
  findDocumentsNeedingExtraction,
} from "@/lib/development/ai/document-understanding";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 3.C — Document Understanding cron.
 *
 * Pulls up to 10 receipts/invoices/delivery-notes/contracts without
 * an active extraction (oldest first) and runs the agent on each.
 * Stops on first `budget_exceeded`.
 *
 * Schedule: every 30 minutes. Idempotent — already-extracted docs
 * filtered by the partial unique index on the active set.
 */
export async function runDevOsDocumentExtraction(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const targets = await findDocumentsNeedingExtraction(10);
  if (targets.length === 0) {
    return {
      status: "success",
      summary: "No documents waiting for extraction.",
      metrics: { attempted: 0, succeeded: 0, dry_run: 0, failed: 0 },
    };
  }

  let succeeded = 0;
  let dryRun = 0;
  let activeSkipped = 0;
  let failed = 0;
  let budgetBlocked = 0;
  for (const t of targets) {
    const res = await extractFromDocument({
      documentId: t.id,
      documentType: t.type,
    });
    if (res.status === "succeeded") succeeded += 1;
    else if (res.status === "dry_run") dryRun += 1;
    else if (res.status === "skipped_active") activeSkipped += 1;
    else if (res.status === "budget_exceeded") {
      budgetBlocked += 1;
      await handle.event("warning", "document_extraction_budget_exceeded", {
        documentId: t.id,
        reason: res.errorMessage,
      });
      break;
    } else {
      failed += 1;
      await handle.event("error", "document_extraction_failed", {
        documentId: t.id,
        errorMessage: res.errorMessage,
      });
    }
  }

  const status: JobOutcome["status"] =
    failed > 0 && succeeded + dryRun === 0 ? "failed" : "success";
  return {
    status,
    summary: `Document extraction: ${succeeded} succeeded, ${dryRun} dry-run, ${activeSkipped} already-active, ${failed} failed, ${budgetBlocked} budget-blocked.`,
    metrics: {
      attempted: targets.length,
      succeeded,
      dry_run: dryRun,
      skipped_active: activeSkipped,
      failed,
      budget_exceeded: budgetBlocked,
    },
  };
}
