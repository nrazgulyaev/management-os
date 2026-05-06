import "server-only";

import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
} from "@/lib/db/schema/sales";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Marks milestones as `invoiced` when `expected_due_date <= today` and
 * the group has been fully signed. Mirrors the pre-invoice job — flips
 * status only; the operator triggers actual invoice issuance from the
 * UI in Checkpoint 2 (auto-issue is Checkpoint 3).
 *
 * Idempotent: walks only milestones at `status in ('pending','pre_invoiced')`.
 */
export async function runDevOsMilestoneInvoice(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { invoiced: 0 },
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
        inArray(contractMilestones.status, ["pending", "pre_invoiced"]),
        isNotNull(contractMilestones.expectedDueDate),
        lte(contractMilestones.expectedDueDate, today),
      ),
    );

  let invoiced = 0;
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
        status: "invoiced",
        invoicedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contractMilestones.id, row.milestone.id));
    invoiced += 1;
    await handle.event("info", "milestone_invoiced", {
      milestoneId: row.milestone.id,
      groupId: row.milestone.contractGroupId,
    });
  }

  return {
    status: "success",
    summary: `Marked ${invoiced} milestones invoiced (${skippedDraftGroup} skipped — group not fully signed).`,
    metrics: { invoiced, skippedDraftGroup, eligible: eligible.length },
  };
}
