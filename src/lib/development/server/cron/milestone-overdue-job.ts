import "server-only";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
  lateFeeRules,
} from "@/lib/db/schema/sales";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Marks invoiced milestones as `overdue` once their grace period
 * (project's late_fee_rule.grace_period_days) is exhausted.
 *
 * Idempotent: only walks milestones at `status='invoiced'`. Each project
 * looks up its active late-fee rule once for the grace period; if no
 * rule exists, defaults to 0 days grace.
 */
export async function runDevOsMilestoneOverdue(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { markedOverdue: 0 },
      error: "DB unavailable",
    };
  }

  // Pull project-level grace periods up-front.
  const rules = await db
    .select({
      projectId: lateFeeRules.projectId,
      grace: lateFeeRules.gracePeriodDays,
    })
    .from(lateFeeRules)
    .where(eq(lateFeeRules.isActive, true));
  const graceByProject = new Map(rules.map((r) => [r.projectId, r.grace]));

  // Eligible: invoiced milestones with a due date.
  const eligible = await db
    .select({
      milestone: contractMilestones,
      projectId: contractGroups.projectId,
    })
    .from(contractMilestones)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, contractMilestones.contractGroupId),
    )
    .where(
      and(
        eq(contractMilestones.status, "invoiced"),
        isNotNull(contractMilestones.expectedDueDate),
      ),
    );

  let marked = 0;
  const today = new Date();

  for (const row of eligible) {
    const grace = graceByProject.get(row.projectId) ?? 0;
    const dueDate = new Date(row.milestone.expectedDueDate as string);
    const cutoff = new Date(dueDate);
    cutoff.setDate(cutoff.getDate() + grace);
    if (cutoff > today) continue;

    await db
      .update(contractMilestones)
      .set({
        status: "overdue",
        overdueAt: today,
        updatedAt: today,
      })
      .where(eq(contractMilestones.id, row.milestone.id));
    marked += 1;
    await handle.event("info", "milestone_overdue", {
      milestoneId: row.milestone.id,
      groupId: row.milestone.contractGroupId,
      grace,
    });
  }

  // Skip-once safety: also update the contract group status to in_payment
  // if it has overdue milestones but is still 'fully_signed'.
  await db.execute(sql`
    update contract_groups
    set status = 'in_payment', updated_at = now()
    where status = 'fully_signed'
      and exists (
        select 1 from contract_milestones cm
        where cm.contract_group_id = contract_groups.id
          and cm.status in ('invoiced','overdue','partially_paid')
      )
  `);

  return {
    status: "success",
    summary: `Marked ${marked} milestones overdue.`,
    metrics: { markedOverdue: marked, eligible: eligible.length },
  };
}
