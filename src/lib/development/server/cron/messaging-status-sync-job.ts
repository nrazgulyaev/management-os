import "server-only";

import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { conversationMessages } from "@/lib/db/schema/messaging";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P2.F.5 — Outbound status reconciliation cron.
 *
 * Sweeps `conversation_messages` rows where `direction = 'outbound'`
 * and `status IN ('queued', 'sending', 'sent')` looking for stuck
 * rows the provider never reported on. After 24h with no terminal
 * status (`delivered` / `read` / `failed`), mark them `failed` with
 * a reconciliation note so the operator UI doesn't show an
 * indefinite "sending" pill.
 *
 * Real status updates flow through provider webhooks (Meta receipts,
 * Twilio MessageStatus callbacks, Resend events). This cron is the
 * safety net for orphaned rows.
 */
export async function runMessagingStatusSync(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stuck = await db
    .update(conversationMessages)
    .set({
      status: "failed",
      errorMessage: "reconciliation: no terminal status received within 24h",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversationMessages.direction, "outbound"),
        sql`${conversationMessages.status} IN ('queued','sending','sent')`,
        isNotNull(conversationMessages.sentAt),
        lt(conversationMessages.sentAt, cutoff),
      ),
    )
    .returning({ id: conversationMessages.id });
  return {
    status: "success",
    summary: `Reconciled ${stuck.length} stuck outbound messages.`,
    metrics: {
      reconciled: stuck.length,
      cutoff: cutoff.toISOString(),
    },
  };
}
