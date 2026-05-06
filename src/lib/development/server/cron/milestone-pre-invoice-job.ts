import "server-only";

import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
} from "@/lib/db/schema/sales";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Generates pre-invoices for milestones whose `pre_invoice_date <= today`,
 * provided the parent contract group is at `fully_signed` or `in_payment`.
 *
 * Idempotent: walks only milestones at `status='pending'` and flips them
 * to `pre_invoiced` after a successful insert (which is gated by
 * `pre_invoiced_at IS NULL`).
 *
 * Checkpoint 2 scope: this job records the state transition
 * (status → pre_invoiced + pre_invoiced_at = now). It does NOT actually
 * issue the `invoices` row yet — the operator does that from the UI.
 * Promoting to auto-issue is Checkpoint 3.
 */
export async function runDevOsMilestonePreInvoice(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { preInvoiced: 0 },
      error: "DB unavailable",
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const eligible = await db
    .select({
      milestone: contractMilestones,
      groupStatus: contractGroups.status,
    })
    .from(contractMilestones)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, contractMilestones.contractGroupId),
    )
    .where(
      and(
        eq(contractMilestones.status, "pending"),
        isNotNull(contractMilestones.preInvoiceDate),
        lte(contractMilestones.preInvoiceDate, today),
      ),
    );

  let preInvoiced = 0;
  let skippedDraftGroup = 0;

  for (const row of eligible) {
    if (
      row.groupStatus !== "fully_signed" &&
      row.groupStatus !== "in_payment"
    ) {
      skippedDraftGroup += 1;
      continue;
    }
    await db
      .update(contractMilestones)
      .set({
        status: "pre_invoiced",
        preInvoicedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contractMilestones.id, row.milestone.id));
    preInvoiced += 1;
    await handle.event("info", "milestone_pre_invoiced", {
      milestoneId: row.milestone.id,
      groupId: row.milestone.contractGroupId,
    });
  }

  return {
    status: "success",
    summary: `Pre-invoiced ${preInvoiced} milestones (${skippedDraftGroup} skipped — group not fully signed).`,
    metrics: { preInvoiced, skippedDraftGroup, eligible: eligible.length },
  };
}
