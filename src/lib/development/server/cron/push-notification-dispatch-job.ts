import "server-only";

import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { dispatchPendingNotifications } from "../notifications/notification-dispatcher";

/**
 * Stage 5.I — Push notification dispatcher (every 5 minutes).
 *
 * Picks up `pending` rows in `notification_dispatch_log` whose
 * `scheduled_at <= now()`, dispatches via `web-push`, and updates
 * status. Falls into dry-run mode if VAPID keys are not configured —
 * idempotent in either path because the SQL filter only selects
 * `status='pending'` rows.
 */
export async function runDevOsPushNotificationDispatch(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { delivered: 0 },
      error: "DB unavailable",
    };
  }
  const result = await dispatchPendingNotifications();
  await handle.event(
    "info",
    `dispatched ${result.delivered}, failed ${result.failed}, unsubscribed ${result.unsubscribed}` +
      (result.dryRun ? " (dry-run)" : ""),
    { ...result },
  );
  return {
    status: "success",
    summary: `Dispatched ${result.delivered}; ${result.failed} failed; ${result.unsubscribed} unsubscribed${
      result.dryRun ? " (dry-run)" : ""
    }.`,
    metrics: { ...result },
  };
}
