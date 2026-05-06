import "server-only";

import {
  findUnprocessedInbound,
  processInboundMessage,
} from "@/lib/development/whatsapp/inbound-processor";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 3.D — WhatsApp inbound processor cron.
 *
 * The webhook persists inbound messages with `status='received'` and
 * returns 200 immediately (Twilio retries slow responses). This cron
 * does the heavy work — phone resolution, voice transcription, AI
 * intent classification, and HITL draft creation.
 *
 * Schedule: every 2 minutes. Idempotent — `status='received'` filter
 * naturally drops processed messages on the next tick.
 */
export async function runDevOsWhatsappInboundProcessor(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const ids = await findUnprocessedInbound(25);
  if (ids.length === 0) {
    return {
      status: "success",
      summary: "No unprocessed inbound WhatsApp messages.",
      metrics: { attempted: 0, succeeded: 0, skipped: 0, failed: 0 },
    };
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    const res = await processInboundMessage(id).catch((err) => ({
      status: "failed" as const,
      errorMessage: err instanceof Error ? err.message : String(err),
    }));
    if (res.status === "succeeded") succeeded += 1;
    else if (res.status === "skipped") skipped += 1;
    else {
      failed += 1;
      await handle.event("error", "whatsapp_inbound_failed", {
        messageId: id,
        errorMessage:
          "errorMessage" in res ? res.errorMessage : undefined,
      });
    }
  }

  const status: JobOutcome["status"] =
    failed > 0 && succeeded === 0 ? "failed" : "success";
  return {
    status,
    summary: `WhatsApp inbound: ${succeeded} processed, ${skipped} skipped, ${failed} failed.`,
    metrics: {
      attempted: ids.length,
      succeeded,
      skipped,
      failed,
    },
  };
}
