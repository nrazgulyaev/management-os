import "server-only";

import { eq, sql, and, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devBudgetLines } from "@/lib/db/schema/dev-finance";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

export interface BudgetVsActualRow {
  categoryId: string;
  categoryCode: string;
  categoryDisplayName: string;
  categoryType: string;
  budgetedUsdMinor: string;
  committedUsdMinor: string;
  actualUsdMinor: string;
  variancePercent: number; // (actual - budgeted) / budgeted
  isOverBudget: boolean;
}

/**
 * Three-state budget vs actual report per category, current budget version
 * only (`superseded_at IS NULL`). Single round-trip via FILTERed aggregates.
 *
 * Variance is signed: positive = over budget. Categories with budgeted=0
 * report variancePercent=0 to avoid divide-by-zero noise.
 */
export async function getBudgetVsActual(
  projectId: string,
): Promise<BudgetVsActualRow[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    WITH cats AS (
      SELECT id, category_code, display_name, category_type
      FROM dev_cost_categories
      WHERE is_active = true
    ),
    bud AS (
      SELECT category_id,
             sum(budgeted_amount_usd_minor)::bigint AS budgeted
      FROM dev_budget_lines
      WHERE project_id = ${projectId} AND superseded_at IS NULL
      GROUP BY category_id
    ),
    com AS (
      SELECT category_id,
             coalesce(sum(amount_usd_minor) FILTER (WHERE status IN ('open','partially_paid')), 0)::bigint
               AS committed
      FROM dev_commitments_ledger
      WHERE project_id = ${projectId}
      GROUP BY category_id
    ),
    act AS (
      SELECT category_id,
             coalesce(sum(amount_usd_minor) FILTER (WHERE direction='outflow'), 0)::bigint
               AS actual
      FROM dev_transactions
      WHERE project_id = ${projectId}
      GROUP BY category_id
    )
    SELECT
      cats.id           AS category_id,
      cats.category_code,
      cats.display_name,
      cats.category_type,
      coalesce(bud.budgeted, 0)::bigint AS budgeted,
      coalesce(com.committed, 0)::bigint AS committed,
      coalesce(act.actual, 0)::bigint AS actual
    FROM cats
    LEFT JOIN bud ON bud.category_id = cats.id
    LEFT JOIN com ON com.category_id = cats.id
    LEFT JOIN act ON act.category_id = cats.id
    WHERE coalesce(bud.budgeted, 0) > 0
       OR coalesce(com.committed, 0) > 0
       OR coalesce(act.actual, 0) > 0
    ORDER BY cats.category_code
  `);

  return (rows as Record<string, unknown>[]).map((r) => {
    const budgeted = BigInt(toStr(r.budgeted));
    const committed = BigInt(toStr(r.committed));
    const actual = BigInt(toStr(r.actual));
    const variancePercent =
      budgeted > 0n
        ? Number(((actual - budgeted) * 10000n) / budgeted) / 100
        : 0;
    return {
      categoryId: String(r.category_id),
      categoryCode: String(r.category_code),
      categoryDisplayName: String(r.display_name),
      categoryType: String(r.category_type),
      budgetedUsdMinor: budgeted.toString(),
      committedUsdMinor: committed.toString(),
      actualUsdMinor: actual.toString(),
      variancePercent,
      isOverBudget: budgeted > 0n && actual > budgeted,
    };
  });
}

export async function getBudgetLine(
  id: string,
): Promise<typeof devBudgetLines.$inferSelect | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(devBudgetLines)
    .where(eq(devBudgetLines.id, id))
    .limit(1);
  return r ?? null;
}

export async function getBudgetHistory(
  projectId: string,
  categoryId: string,
  unitId?: string | null,
): Promise<(typeof devBudgetLines.$inferSelect)[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = [
    eq(devBudgetLines.projectId, projectId),
    eq(devBudgetLines.categoryId, categoryId),
  ];
  if (unitId) {
    conditions.push(eq(devBudgetLines.unitId, unitId));
  } else if (unitId === null) {
    conditions.push(isNull(devBudgetLines.unitId));
  }
  return await db
    .select()
    .from(devBudgetLines)
    .where(and(...conditions))
    .orderBy(devBudgetLines.budgetVersion);
}

export interface ProjectFinancialSummary {
  totalBudgetUsdMinor: string;
  totalCommittedUsdMinor: string;
  totalActualUsdMinor: string;
  remainingBudgetUsdMinor: string;
  budgetConsumedPercent: number;
  outstandingCommitmentUsdMinor: string;
  byCategoryType: {
    capex: { budget: string; actual: string };
    opex: { budget: string; actual: string };
    cogs: { budget: string; actual: string };
  };
}

export async function getProjectFinancialSummary(
  projectId: string,
): Promise<ProjectFinancialSummary> {
  const rows = await getBudgetVsActual(projectId);
  let budget = 0n;
  let committed = 0n;
  let actual = 0n;
  const byType: Record<string, { budget: bigint; actual: bigint }> = {
    capex: { budget: 0n, actual: 0n },
    opex: { budget: 0n, actual: 0n },
    cogs: { budget: 0n, actual: 0n },
  };
  for (const r of rows) {
    const b = BigInt(r.budgetedUsdMinor);
    const c = BigInt(r.committedUsdMinor);
    const a = BigInt(r.actualUsdMinor);
    budget += b;
    committed += c;
    actual += a;
    if (r.categoryType in byType) {
      byType[r.categoryType].budget += b;
      byType[r.categoryType].actual += a;
    }
  }
  const remaining = budget > actual ? budget - actual : 0n;
  const consumedPct =
    budget > 0n ? Number((actual * 10000n) / budget) / 100 : 0;
  const outstanding = committed > actual ? committed - actual : 0n;
  return {
    totalBudgetUsdMinor: budget.toString(),
    totalCommittedUsdMinor: committed.toString(),
    totalActualUsdMinor: actual.toString(),
    remainingBudgetUsdMinor: remaining.toString(),
    budgetConsumedPercent: consumedPct,
    outstandingCommitmentUsdMinor: outstanding.toString(),
    byCategoryType: {
      capex: {
        budget: byType.capex.budget.toString(),
        actual: byType.capex.actual.toString(),
      },
      opex: {
        budget: byType.opex.budget.toString(),
        actual: byType.opex.actual.toString(),
      },
      cogs: {
        budget: byType.cogs.budget.toString(),
        actual: byType.cogs.actual.toString(),
      },
    },
  };
}
