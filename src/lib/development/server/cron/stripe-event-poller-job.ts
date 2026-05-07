import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P3.G — Stripe event poller cron.
 *
 * Webhook delivery is the primary inbound channel for Stripe events.
 * This cron is the safety net — it polls `/v1/events` for any events
 * the webhook missed (Stripe retries for 3 days but we don't want
 * dropped events to slip past).
 *
 * P3.G bootstrap ships the cron registration; the poll-and-replay
 * implementation lives behind a per-connection cursor and lands
 * alongside the operator UI for managing Stripe connections (P3.G+).
 * The shell job below makes the schedule visible in `check:cron` and
 * the dashboard so the wiring is provisioned ahead of the
 * implementation.
 */
export async function runStripeEventPoller(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  return {
    status: "success",
    summary:
      "no-op (webhook channel is primary; poller stub awaits per-connection cursor wiring in P3.G+).",
    metrics: { polled: 0, replayed: 0 },
  };
}
