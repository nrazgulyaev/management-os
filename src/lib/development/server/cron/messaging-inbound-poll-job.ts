import "server-only";

import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P2.F.4 — Messaging inbound polling cron.
 *
 * Webhook-driven channels (WhatsApp, Telegram, Instagram, Messenger)
 * deliver inbound messages in real time via the
 * `/api/webhooks/messaging/<channel>` routes — no polling needed.
 *
 * This cron exists for the channels that *don't* push:
 *   - Gmail in pull-mode (when a Pub/Sub push subscription is not yet
 *     wired up): poll the last `historyId` for unread messages and
 *     funnel them through `MessagingService.handleIncomingMessage`.
 *   - Future IMAP/POP3 mailboxes if we add them.
 *
 * P2.F bootstrap: this runner is intentionally a no-op shell. Once
 * Gmail Pub/Sub push lands (P2.G), the entire job key can be retired
 * — but until then keep the schedule wired so we don't have to
 * re-deploy the vercel.json crons block when the implementation lands.
 */
export async function runMessagingInboundPoll(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  return {
    status: "success",
    summary: "no-op (push-only channels in P2.F bootstrap; Gmail polling lands with P2.G)",
    metrics: {
      polled: 0,
      ingested: 0,
    },
  };
}
