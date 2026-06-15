import "server-only";

import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  contractMilestones,
  lateFeeAccruals,
  lateFeeRules,
  type LateFeeAccrual,
  type LateFeeRule,
} from "@/lib/db/schema/sales";
import { contractGroups } from "@/lib/db/schema/sales";
import { projects } from "@/lib/db/schema/projects";
import type { LateFeeAccrualRow, LateFeeRuleData } from "@/lib/development/types/payments";
import { computeAccrualForDay } from "./late-fee-helpers";

export type {
  LateFeeAccrualRow,
  LateFeeRuleData,
} from "@/lib/development/types/payments";

function ruleToData(r: LateFeeRule): LateFeeRuleData {
  return {
    id: r.id,
    projectId: r.projectId,
    gracePeriodDays: r.gracePeriodDays,
    feeType: r.feeType as LateFeeRuleData["feeType"],
    feeValue: Number(r.feeValue),
    feeCurrency: r.feeCurrency,
    maxFeeUsdMinor: r.maxFeeUsdMinor,
    isActive: r.isActive,
    notes: r.notes,
  };
}

function accrualToRow(a: LateFeeAccrual): LateFeeAccrualRow {
  return {
    id: a.id,
    contractMilestoneId: a.contractMilestoneId,
    ruleId: a.ruleId,
    accruedAt:
      a.accruedAt instanceof Date
        ? a.accruedAt.toISOString()
        : String(a.accruedAt),
    daysOverdue: a.daysOverdue,
    feeAmountUsdMinor: a.feeAmountUsdMinor,
    feeAmountIdrMinor: a.feeAmountIdrMinor,
    fxRate: Number(a.fxRate),
    status: a.status as LateFeeAccrualRow["status"],
    notes: a.notes,
  };
}

export async function getActiveLateFeeRule(
  projectId: string,
  // TENANCY: `late_fee_rules` has no org column — it anchors org via its
  // project. Page/request callers must pass no org (defaults to the caller's
  // org via requireOrgId). The cron (`accrueLateFeesForOverdueMilestones`)
  // iterates every tenant's overdue milestones and passes each milestone's
  // own org so background accrual is not request-scoped.
  organizationId: string | null = null,
): Promise<LateFeeRuleData | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = organizationId ?? (await requireOrgId());
  const [r] = await db
    .select()
    .from(lateFeeRules)
    .innerJoin(projects, eq(projects.id, lateFeeRules.projectId))
    .where(
      and(
        eq(lateFeeRules.projectId, projectId),
        eq(lateFeeRules.isActive, true),
        eq(projects.organizationId, orgId),
      ),
    )
    .limit(1);
  return r ? ruleToData(r.late_fee_rules) : null;
}

export async function getLateFeeAccruals(
  milestoneId: string,
): Promise<LateFeeAccrualRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({ accrual: lateFeeAccruals })
    .from(lateFeeAccruals)
    .innerJoin(
      contractMilestones,
      eq(contractMilestones.id, lateFeeAccruals.contractMilestoneId),
    )
    .where(
      and(
        eq(lateFeeAccruals.contractMilestoneId, milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    )
    .orderBy(desc(lateFeeAccruals.accruedAt));
  return rows.map((r) => accrualToRow(r.accrual));
}

export interface LateFeeAccrualSummary {
  milestonesTouched: number;
  accrualsCreated: number;
  totalUsdMinor: bigint;
}

/**
 * Cron-friendly: scans `contract_milestones` in `overdue` status, computes
 * today's accrual via `computeAccrualForDay`, and inserts a row in
 * `late_fee_accruals` with the milestone's project's active rule.
 *
 * The unique-per-day index makes re-runs idempotent: a second run on the
 * same UTC day silently no-ops. Returns a summary.
 */
export async function accrueLateFeesForOverdueMilestones(args: {
  asOf?: Date;
  fxRateUsdToIdr: number;
}): Promise<LateFeeAccrualSummary> {
  const db = getDb();
  if (!db) {
    return { milestonesTouched: 0, accrualsCreated: 0, totalUsdMinor: 0n };
  }
  const asOf = args.asOf ?? new Date();

  const overdueRows = await db
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
        eq(contractMilestones.status, "overdue"),
        lte(contractMilestones.expectedDueDate, asOf.toISOString().slice(0, 10)),
      ),
    );

  let accrualsCreated = 0;
  let totalUsd = 0n;
  for (const row of overdueRows) {
    // Cron path: pass the milestone's own org so the per-tenant rule lookup
    // is scoped to the project's tenant rather than a request org.
    const rule = await getActiveLateFeeRule(
      row.projectId,
      row.milestone.organizationId,
    );
    if (!rule) continue;
    if (!row.milestone.expectedDueDate) continue;

    const accrual = computeAccrualForDay({
      expectedAmountUsdMinor: row.milestone.expectedAmountUsdMinor,
      expectedDueDate: new Date(row.milestone.expectedDueDate),
      asOf,
      rule,
      alreadyAccruedUsdMinor: row.milestone.lateFeeAccrualUsdMinor,
    });
    if (accrual.todayFeeUsdMinor === 0n) continue;

    const idrMinor = BigInt(
      Math.round(Number(accrual.todayFeeUsdMinor) * args.fxRateUsdToIdr),
    );

    try {
      await db.insert(lateFeeAccruals).values({
        contractMilestoneId: row.milestone.id,
        ruleId: rule.id,
        accruedAt: asOf,
        daysOverdue: accrual.daysOverdue,
        feeAmountUsdMinor: accrual.todayFeeUsdMinor,
        feeAmountIdrMinor: idrMinor,
        fxRate: String(args.fxRateUsdToIdr),
        status: "accrued",
        notes: accrual.reason,
      });
      // Bump cumulative on the milestone.
      await db
        .update(contractMilestones)
        .set({
          lateFeeAccrualUsdMinor: accrual.totalFeeUsdMinor,
          updatedAt: asOf,
        })
        .where(eq(contractMilestones.id, row.milestone.id));
      accrualsCreated += 1;
      totalUsd += accrual.todayFeeUsdMinor;
    } catch (err) {
      // Likely the unique-per-day index — already accrued today.
      void err;
    }
  }

  return {
    milestonesTouched: overdueRows.length,
    accrualsCreated,
    totalUsdMinor: totalUsd,
  };
}

export async function waiveLateFees(args: {
  milestoneId: string;
  reason: string;
}): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const organizationId = await requireOrgId();

  // WRITE-IDOR guard: confirm the target milestone belongs to the caller's
  // org BEFORE flipping any accrual to `waived`. Without this, a client could
  // waive another tenant's late fees by supplying their milestone id.
  const [milestone] = await db
    .select({ id: contractMilestones.id })
    .from(contractMilestones)
    .where(
      and(
        eq(contractMilestones.id, args.milestoneId),
        eq(contractMilestones.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!milestone) return 0;

  const updated = await db
    .update(lateFeeAccruals)
    .set({
      status: "waived",
      notes: `Waived: ${args.reason}`,
    })
    .where(
      and(
        eq(lateFeeAccruals.contractMilestoneId, args.milestoneId),
        eq(lateFeeAccruals.status, "accrued"),
      ),
    )
    .returning({ id: lateFeeAccruals.id });
  return updated.length;
}
