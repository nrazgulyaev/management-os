import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { distributions } from "@/lib/db/schema/investor-capital";
import type {
  DistributionAllocationItem,
  DistributionDetail,
  DistributionListItem,
} from "@/lib/development/types/investors";
import type {
  DistributionStatus,
  DistributionType,
} from "@/lib/development/constants/investor-constants";
import {
  computeCapitalReturn,
  computeProfitDistribution,
  sumMap,
  type CommitmentSnapshot,
} from "@/lib/development/distribution-helpers";

// Re-export pure helpers so existing callers keep working.
export {
  computeCapitalReturn,
  computeProfitDistribution,
} from "@/lib/development/distribution-helpers";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

export interface DistributionFilters {
  projectId?: string | null;
  status?: DistributionStatus;
  type?: DistributionType;
}

export async function getDistributions(
  filters: DistributionFilters = {},
): Promise<DistributionListItem[]> {
  const db = getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.projectId !== undefined) {
    if (filters.projectId === null) {
      conditions.push(sql`d.project_id IS NULL`);
    } else {
      conditions.push(sql`d.project_id = ${filters.projectId}`);
    }
  }
  if (filters.status) conditions.push(sql`d.status = ${filters.status}`);
  if (filters.type) conditions.push(sql`d.distribution_type = ${filters.type}`);
  const where = conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.project_id,
      p.name AS project_name,
      d.distribution_number,
      d.distribution_type,
      d.total_amount_usd_minor,
      d.trigger_reason,
      d.declared_at,
      d.effective_date,
      d.status,
      d.completed_at,
      coalesce(a.allocation_count, 0)::int AS allocation_count
    FROM distributions d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN (
      SELECT distribution_id, count(*)::int AS allocation_count
      FROM distribution_allocations
      GROUP BY distribution_id
    ) a ON a.distribution_id = d.id
    ${where}
    ORDER BY d.declared_at DESC
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    projectId: r.project_id ? String(r.project_id) : null,
    projectName: r.project_name ? String(r.project_name) : null,
    distributionNumber: Number(r.distribution_number),
    distributionType: r.distribution_type as DistributionType,
    totalAmountUsdMinor: toStr(r.total_amount_usd_minor),
    triggerReason: r.trigger_reason as DistributionListItem["triggerReason"],
    declaredAt: new Date(r.declared_at as string).toISOString(),
    effectiveDate: String(r.effective_date),
    status: r.status as DistributionStatus,
    completedAt: r.completed_at
      ? new Date(r.completed_at as string).toISOString()
      : null,
    allocationCount: Number(r.allocation_count ?? 0),
  }));
}

export async function getDistribution(
  id: string,
): Promise<DistributionDetail | null> {
  const db = getDb();
  if (!db) return null;

  const list = await getDistributions();
  const summary = list.find((d) => d.id === id);
  if (!summary) return null;

  const [base] = await db
    .select({ notes: distributions.notes })
    .from(distributions)
    .where(eq(distributions.id, id))
    .limit(1);

  const allocRows = await db.execute(sql`
    SELECT
      a.id,
      a.commitment_id,
      cc.commitment_code,
      i.legal_name AS investor_legal_name,
      a.capital_return_amount_usd_minor,
      a.profit_amount_usd_minor,
      a.total_amount_usd_minor,
      a.outstanding_capital_at_declare_usd_minor,
      a.profit_share_percent_used,
      a.status,
      a.executed_at
    FROM distribution_allocations a
    JOIN capital_commitments cc ON cc.id = a.commitment_id
    JOIN investors i ON i.id = cc.investor_id
    WHERE a.distribution_id = ${id}
    ORDER BY cc.capital_return_priority ASC, cc.commitment_code ASC
  `);

  const allocations: DistributionAllocationItem[] = (
    allocRows as Record<string, unknown>[]
  ).map((r) => ({
    id: String(r.id),
    commitmentId: String(r.commitment_id),
    commitmentCode: String(r.commitment_code),
    investorLegalName: String(r.investor_legal_name),
    capitalReturnAmountUsdMinor: toStr(r.capital_return_amount_usd_minor),
    profitAmountUsdMinor: toStr(r.profit_amount_usd_minor),
    totalAmountUsdMinor: toStr(r.total_amount_usd_minor),
    outstandingCapitalAtDeclareUsdMinor: toStr(
      r.outstanding_capital_at_declare_usd_minor,
    ),
    profitSharePercentUsed: toStr(r.profit_share_percent_used),
    status: r.status as DistributionAllocationItem["status"],
    executedAt: r.executed_at
      ? new Date(r.executed_at as string).toISOString()
      : null,
  }));

  return {
    ...summary,
    notes: base?.notes ?? null,
    allocations,
  };
}

// ---------------------------------------------------------------------------
// Distribution computation (PURE) — used by both `previewDistribution` and
// `declareDistribution`. Algorithm:
//
//   capital_return:
//     1. Outstanding capital per commitment = total_drawn − total_returned_capital.
//     2. Group commitments by capital_return_priority ASC.
//     3. For each priority tier (in order), allocate min(remaining, tierTotalOutstanding):
//          per-commitment share = floor(outstanding_i / tierTotalOutstanding * tierAllocation).
//        Any rounding residue is absorbed by the largest allocation in the tier.
//     4. Stop when remaining == 0n OR no more outstanding capital.
//     5. Excess remaining (if total > sum-outstanding) is reported as `unallocatedUsdMinor`.
//
//   profit_distribution:
//     1. weight_i = profit_share_percent_i * drawn_usd_minor_i
//     2. share_i  = floor(totalAmount * weight_i / sum(weight))
//     3. Residue absorbed by largest share.
//     Commitments with drawn==0 OR profit_share==0 get zero.
//
//   mixed:
//     1. Run capital_return until remaining == 0 OR no outstanding.
//     2. If remaining > 0, run profit_distribution on the remainder.
//     3. Per-commitment allocation = capital_return + profit, total_amount = sum.
// ---------------------------------------------------------------------------

export interface PreviewAllocation {
  commitmentId: string;
  commitmentCode: string;
  investorLegalName: string;
  capitalReturnAmountUsdMinor: bigint;
  profitAmountUsdMinor: bigint;
  totalAmountUsdMinor: bigint;
  outstandingCapitalAtDeclareUsdMinor: bigint;
  profitSharePercentUsed: string;
}

export interface PreviewDistributionResult {
  allocations: PreviewAllocation[];
  totalAllocatedUsdMinor: bigint;
  unallocatedUsdMinor: bigint;
}

export interface PreviewDistributionInput {
  projectId: string | null;
  totalAmountUsdMinor: bigint | string | number;
  distributionType: DistributionType;
}

const toBig = (v: bigint | string | number): bigint => {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
};

async function loadCommitmentSnapshots(
  projectId: string | null,
): Promise<CommitmentSnapshot[]> {
  const db = getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [
    sql`cc.status IN ('active','fully_called')`,
  ];
  if (projectId) {
    conditions.push(sql`cc.project_id = ${projectId}`);
  } else {
    conditions.push(sql`cc.project_id IS NULL`);
  }
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await db.execute(sql`
    SELECT
      cc.id,
      cc.commitment_code,
      cc.capital_return_priority AS priority,
      cc.profit_share_percent,
      i.legal_name AS investor_legal_name,
      coalesce(iw.total_drawn_usd_minor, 0)::bigint AS drawn_usd_minor,
      coalesce(iw.total_returned_capital_usd_minor, 0)::bigint AS returned_capital_usd_minor
    FROM capital_commitments cc
    JOIN investors i ON i.id = cc.investor_id
    LEFT JOIN investor_wallets iw ON iw.commitment_id = cc.id
    ${where}
    ORDER BY cc.capital_return_priority ASC, cc.commitment_code ASC
  `);

  return (rows as Record<string, unknown>[]).map((r) => {
    const drawn = BigInt(toStr(r.drawn_usd_minor));
    const returned = BigInt(toStr(r.returned_capital_usd_minor));
    const outstanding = drawn > returned ? drawn - returned : 0n;
    return {
      commitmentId: String(r.id),
      commitmentCode: String(r.commitment_code),
      investorLegalName: String(r.investor_legal_name),
      priority: Number(r.priority),
      profitSharePercent: toStr(r.profit_share_percent),
      drawnUsdMinor: drawn,
      returnedCapitalUsdMinor: returned,
      outstandingCapitalUsdMinor: outstanding,
    };
  });
}

export async function previewDistribution(
  input: PreviewDistributionInput,
): Promise<PreviewDistributionResult> {
  const total = toBig(input.totalAmountUsdMinor);
  const snapshots = await loadCommitmentSnapshots(input.projectId);

  let capitalMap = new Map<string, bigint>();
  let profitMap = new Map<string, bigint>();
  let totalAllocated = 0n;

  if (input.distributionType === "capital_return") {
    capitalMap = computeCapitalReturn(snapshots, total);
    totalAllocated = sumMap(capitalMap);
  } else if (input.distributionType === "profit_distribution") {
    profitMap = computeProfitDistribution(snapshots, total);
    totalAllocated = sumMap(profitMap);
  } else {
    // mixed: capital_return first, then profit on the leftover.
    capitalMap = computeCapitalReturn(snapshots, total);
    const capitalAllocated = sumMap(capitalMap);
    const remainingForProfit = total - capitalAllocated;
    if (remainingForProfit > 0n) {
      profitMap = computeProfitDistribution(snapshots, remainingForProfit);
    }
    totalAllocated = sumMap(capitalMap) + sumMap(profitMap);
  }

  // Build per-commitment allocation rows. A commitment is included if it
  // received any allocation (capital or profit > 0).
  const allCommitmentIds = new Set<string>([
    ...capitalMap.keys(),
    ...profitMap.keys(),
  ]);
  const allocations: PreviewAllocation[] = [];
  for (const s of snapshots) {
    if (!allCommitmentIds.has(s.commitmentId)) continue;
    const cap = capitalMap.get(s.commitmentId) ?? 0n;
    const profit = profitMap.get(s.commitmentId) ?? 0n;
    if (cap === 0n && profit === 0n) continue;
    allocations.push({
      commitmentId: s.commitmentId,
      commitmentCode: s.commitmentCode,
      investorLegalName: s.investorLegalName,
      capitalReturnAmountUsdMinor: cap,
      profitAmountUsdMinor: profit,
      totalAmountUsdMinor: cap + profit,
      outstandingCapitalAtDeclareUsdMinor: s.outstandingCapitalUsdMinor,
      profitSharePercentUsed: s.profitSharePercent,
    });
  }

  return {
    allocations,
    totalAllocatedUsdMinor: totalAllocated,
    unallocatedUsdMinor: total - totalAllocated,
  };
}

// Internal helper exported so distribution-actions can reuse the same loader.
export const _internals = {
  loadCommitmentSnapshots,
};
