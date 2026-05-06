import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { dispatchDueDeliveries } from "@/lib/development/server/webhooks/webhook-dispatcher";

/**
 * Stage 5.J — picks queued webhook deliveries (pending or retrying past
 * `next_retry_at`) and dispatches each. HMAC signing + retry scheduling
 * lives inside the dispatcher.
 *
 * Idempotent at the row level: each delivery row transitions
 * pending → retrying → delivered/failed exactly once per attempt.
 */
export async function runDevOsWebhookDelivery(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const result = await dispatchDueDeliveries({ limit: 250 });
  return {
    status: "success",
    summary:
      `Webhook delivery: scanned ${result.scanned}, ` +
      `delivered ${result.delivered}, retrying ${result.retrying}, ` +
      `failed ${result.failed}.`,
    metrics: {
      scanned: result.scanned,
      delivered: result.delivered,
      retrying: result.retrying,
      failed: result.failed,
    },
  };
}
