import "server-only";

import { cleanupStalePendingAttachments } from "@/features/guest-ai-concierge/attachment-cleanup";
import type { JobOutcome, JobRunHandle } from "./runner";

/**
 * V9L — runner for `guest_request_attachment_cleanup`. Sweeps the
 * stale `pending` rows older than 24 h, deletes their storage object
 * best-effort, and flips the DB row to `deleted` with reason
 * `stale_pending`.
 */
export async function runGuestRequestAttachmentCleanupJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  await handle.event("info", "scanning stale pending guest attachments");
  const out = await cleanupStalePendingAttachments({});
  if (out.failed > 0) {
    for (const note of out.notes.slice(0, 10)) {
      await handle.event("warning", note);
    }
  }
  return {
    status:
      out.failed > 0
        ? out.deleted > 0
          ? "partial_success"
          : "failed"
        : "success",
    summary: `Scanned ${out.scanned} · deleted ${out.deleted} · failed ${out.failed}`,
    metrics: {
      scanned: out.scanned,
      deleted: out.deleted,
      failed: out.failed,
    },
  };
}
