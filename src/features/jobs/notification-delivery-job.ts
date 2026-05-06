import "server-only";

import { deliverPendingNotifications } from "@/features/notifications/delivery";
import type { JobOutcome, JobRunHandle } from "./runner";

const BATCH_LIMIT = 100;

/**
 * Worker job that walks every queued notification ready for delivery and
 * fans them out through the provider abstraction. Per-row failures are
 * captured in `notification_deliveries`, never thrown.
 */
export async function runNotificationDeliveryJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const metrics = await deliverPendingNotifications(BATCH_LIMIT);

  await handle.event("info", "Delivery batch complete", { ...metrics });

  const status =
    metrics.failed > 0 && metrics.sent > 0
      ? "partial_success"
      : metrics.failed > 0 && metrics.sent === 0 && metrics.suppressed === 0
        ? "failed"
        : "success";

  return {
    status,
    summary: `Checked ${metrics.notificationsChecked} · sent ${metrics.sent} · failed ${metrics.failed} · suppressed ${metrics.suppressed} · retries ${metrics.retriesScheduled}`,
    metrics: {
      ...metrics,
    },
    error: metrics.failed > 0 ? `${metrics.failed} delivery row(s) failed` : undefined,
  };
}
