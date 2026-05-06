import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
  lateFeeAccruals,
  lateFeeRules,
} from "@/lib/db/schema/sales";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { computeAccrualForDay } from "../late-fee-helpers";

const FX_FALLBACK_USD_TO_IDR = 16500;

/**
 * Walks every overdue milestone, computes the late-fee accrual for the
 * elapsed days since the previous accrual (or since `overdue_at` if none
 * yet), and inserts a `late_fee_accruals` row.
 *
 * Idempotent: the SQL migration declares a unique index on
 * `(milestone_id, date_trunc('day', accrued_at))`, so re-running on the
 * same UTC day is a safe no-op even if the wall-clock time changes.
 */
export async function runDevOsLateFeeAccrual(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { accruals: 0 },
      error: "DB unavailable",
    };
  }

  const overdueMilestones = await db
    .select({
      milestone: contractMilestones,
      projectId: contractGroups.projectId,
    })
    .from(contractMilestones)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, contractMilestones.contractGroupId),
    )
    .where(eq(contractMilestones.status, "overdue"));

  // Cache rules per project.
  const ruleByProject = new Map<string, typeof lateFeeRules.$inferSelect>();
  if (overdueMilestones.length > 0) {
    const projectIds = Array.from(
      new Set(overdueMilestones.map((m) => m.projectId)),
    );
    const rules = await db
      .select()
      .from(lateFeeRules)
      .where(
        and(
          eq(lateFeeRules.isActive, true),
          sql`${lateFeeRules.projectId} = ANY(${projectIds})`,
        ),
      );
    for (const r of rules) ruleByProject.set(r.projectId, r);
  }

  let inserted = 0;
  let skippedNoRule = 0;
  let skippedAlreadyToday = 0;

  for (const row of overdueMilestones) {
    const rule = ruleByProject.get(row.projectId);
    if (!rule) {
      skippedNoRule += 1;
      continue;
    }
    const dueDate = row.milestone.expectedDueDate
      ? new Date(row.milestone.expectedDueDate)
      : new Date();

    // Sum of prior accruals for this milestone (cumulative) — used to enforce cap.
    const [priorRow] = await db
      .select({
        total: sql<string>`coalesce(sum(${lateFeeAccruals.feeAmountUsdMinor})::numeric, 0)`,
      })
      .from(lateFeeAccruals)
      .where(eq(lateFeeAccruals.contractMilestoneId, row.milestone.id));
    const priorTotal = BigInt(Math.round(Number(priorRow?.total ?? 0)));

    const result = computeAccrualForDay({
      rule: {
        id: rule.id,
        projectId: rule.projectId,
        gracePeriodDays: rule.gracePeriodDays,
        feeType: rule.feeType as "flat_fee" | "percent_per_day" | "percent_per_month" | "tiered",
        feeValue: Number(rule.feeValue),
        feeCurrency: rule.feeCurrency,
        maxFeeUsdMinor: rule.maxFeeUsdMinor,
        isActive: rule.isActive,
        notes: rule.notes,
      },
      expectedAmountUsdMinor: row.milestone.expectedAmountUsdMinor,
      expectedDueDate: dueDate,
      asOf: new Date(),
      alreadyAccruedUsdMinor: priorTotal,
    });

    if (result.todayFeeUsdMinor === 0n) {
      skippedAlreadyToday += 1;
      continue;
    }

    try {
      await db.insert(lateFeeAccruals).values({
        contractMilestoneId: row.milestone.id,
        ruleId: rule.id,
        daysOverdue: result.daysOverdue,
        feeAmountUsdMinor: result.todayFeeUsdMinor,
        feeAmountIdrMinor: BigInt(
          Math.round(Number(result.todayFeeUsdMinor) * FX_FALLBACK_USD_TO_IDR),
        ),
        fxRate: String(FX_FALLBACK_USD_TO_IDR),
        status: "accrued",
        notes: result.reason,
      });
      inserted += 1;

      // Update milestone running total (for fast read in UI).
      await db
        .update(contractMilestones)
        .set({
          lateFeeAccrualUsdMinor: result.totalFeeUsdMinor,
          updatedAt: new Date(),
        })
        .where(eq(contractMilestones.id, row.milestone.id));

      await handle.event("info", "late_fee_accrued", {
        milestoneId: row.milestone.id,
        deltaUsdMinor: result.todayFeeUsdMinor.toString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg.includes("late_fee_accruals_unique_per_day")) {
        skippedAlreadyToday += 1;
        continue;
      }
      throw err;
    }
  }

  return {
    status: "success",
    summary: `Accrued late fees for ${inserted} milestones (${skippedAlreadyToday} already accrued today, ${skippedNoRule} skipped — no rule).`,
    metrics: {
      accrualsInserted: inserted,
      skippedAlreadyToday,
      skippedNoRule,
      overdueMilestones: overdueMilestones.length,
    },
  };
}
