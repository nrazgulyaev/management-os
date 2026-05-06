import "server-only";

import { eq, sql, and, gte, lte, desc, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import type { SupportedCurrency } from "@/lib/development/constants/investor-constants";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

export interface TransactionListItem {
  id: string;
  transactionCode: string;
  bankAccountId: string;
  direction: "inflow" | "outflow" | "internal_transfer";
  categoryId: string | null;
  projectId: string | null;
  unitId: string | null;
  relatedCommitmentId: string | null;
  amountMinor: string;
  currency: SupportedCurrency;
  amountUsdMinor: string;
  fxRateAtTransaction: string;
  counterpartyName: string | null;
  counterpartyContactId: string | null;
  transactionDate: string;
  description: string;
  externalReference: string | null;
  allocationType: "single_project" | "multi_project" | "company_overhead";
  relatedDrawdownId: string | null;
  relatedDistributionId: string | null;
  reconciledAt: string | null;
  bankStatementLineRef: string | null;
}

export interface TransactionFilters {
  bankAccountId?: string;
  projectId?: string;
  categoryId?: string;
  direction?: "inflow" | "outflow" | "internal_transfer";
  fromDate?: string;
  toDate?: string;
  reconciled?: boolean;
}

export async function getTransactions(
  filters: TransactionFilters = {},
  pagination: { limit?: number; offset?: number } = {},
): Promise<TransactionListItem[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.bankAccountId)
    conditions.push(eq(devTransactions.bankAccountId, filters.bankAccountId));
  if (filters.projectId)
    conditions.push(eq(devTransactions.projectId, filters.projectId));
  if (filters.categoryId)
    conditions.push(eq(devTransactions.categoryId, filters.categoryId));
  if (filters.direction)
    conditions.push(eq(devTransactions.direction, filters.direction));
  if (filters.fromDate)
    conditions.push(gte(devTransactions.transactionDate, filters.fromDate));
  if (filters.toDate)
    conditions.push(lte(devTransactions.transactionDate, filters.toDate));
  if (filters.reconciled === true)
    conditions.push(sql`${devTransactions.reconciledAt} IS NOT NULL`);
  if (filters.reconciled === false)
    conditions.push(isNull(devTransactions.reconciledAt));

  const where = conditions.length ? and(...conditions) : undefined;
  const limit = pagination.limit ?? 100;
  const offset = pagination.offset ?? 0;

  const rows = await db
    .select()
    .from(devTransactions)
    .where(where)
    .orderBy(desc(devTransactions.transactionDate), desc(devTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    transactionCode: r.transactionCode,
    bankAccountId: r.bankAccountId,
    direction: r.direction as TransactionListItem["direction"],
    categoryId: r.categoryId ?? null,
    projectId: r.projectId ?? null,
    unitId: r.unitId ?? null,
    relatedCommitmentId: r.relatedCommitmentId ?? null,
    amountMinor: toStr(r.amountMinor),
    currency: r.currency as SupportedCurrency,
    amountUsdMinor: toStr(r.amountUsdMinor),
    fxRateAtTransaction: toStr(r.fxRateAtTransaction),
    counterpartyName: r.counterpartyName ?? null,
    counterpartyContactId: r.counterpartyContactId ?? null,
    transactionDate: String(r.transactionDate),
    description: r.description,
    externalReference: r.externalReference ?? null,
    allocationType: r.allocationType as TransactionListItem["allocationType"],
    relatedDrawdownId: r.relatedDrawdownId ?? null,
    relatedDistributionId: r.relatedDistributionId ?? null,
    reconciledAt: r.reconciledAt ? new Date(r.reconciledAt).toISOString() : null,
    bankStatementLineRef: r.bankStatementLineRef ?? null,
  }));
}

export interface TransactionMetricsByCategory {
  categoryId: string | null;
  categoryCode: string | null;
  inflowUsdMinor: string;
  outflowUsdMinor: string;
  netUsdMinor: string;
}

export async function getTransactionMetrics(
  projectId: string,
  fromDate?: string,
  toDate?: string,
): Promise<TransactionMetricsByCategory[]> {
  const db = getDb();
  if (!db) return [];
  const dateConditions: ReturnType<typeof sql>[] = [];
  if (fromDate) dateConditions.push(sql`t.transaction_date >= ${fromDate}`);
  if (toDate) dateConditions.push(sql`t.transaction_date <= ${toDate}`);
  const dateClause =
    dateConditions.length > 0
      ? sql`AND ${sql.join(dateConditions, sql` AND `)}`
      : sql``;

  const rows = await db.execute(sql`
    SELECT
      t.category_id,
      c.category_code,
      coalesce(sum(t.amount_usd_minor) FILTER (WHERE t.direction='inflow'), 0)::bigint
        AS inflow,
      coalesce(sum(t.amount_usd_minor) FILTER (WHERE t.direction='outflow'), 0)::bigint
        AS outflow
    FROM dev_transactions t
    LEFT JOIN dev_cost_categories c ON c.id = t.category_id
    WHERE t.project_id = ${projectId}
      ${dateClause}
    GROUP BY t.category_id, c.category_code
    ORDER BY c.category_code NULLS LAST
  `);

  return (rows as Record<string, unknown>[]).map((r) => {
    const inflow = BigInt(toStr(r.inflow));
    const outflow = BigInt(toStr(r.outflow));
    return {
      categoryId: r.category_id ? String(r.category_id) : null,
      categoryCode: r.category_code ? String(r.category_code) : null,
      inflowUsdMinor: inflow.toString(),
      outflowUsdMinor: outflow.toString(),
      netUsdMinor: (inflow - outflow).toString(),
    };
  });
}

export async function getTransactionsForReconciliation(
  bankAccountId: string,
): Promise<TransactionListItem[]> {
  return getTransactions({ bankAccountId, reconciled: false });
}

export interface CashFlowSummary {
  inflowUsdMinor: string;
  outflowUsdMinor: string;
  netUsdMinor: string;
  inflowCount: number;
  outflowCount: number;
}

/**
 * Used by `evaluateSelfSustainingThreshold`. Excludes the two
 * categories that aren't operational cash flow:
 *   - drawdown receipts (capital, not earnings) — detected via
 *     `related_drawdown_id IS NOT NULL`
 *   - corporate_event-tagged categories (director loans, dividends)
 */
export async function getCashFlowSummary(
  projectId: string | null,
  fromDate: string,
  toDate?: string,
): Promise<CashFlowSummary> {
  const db = getDb();
  if (!db) {
    return {
      inflowUsdMinor: "0",
      outflowUsdMinor: "0",
      netUsdMinor: "0",
      inflowCount: 0,
      outflowCount: 0,
    };
  }

  const projectClause = projectId
    ? sql`AND t.project_id = ${projectId}`
    : sql``;
  const toClause = toDate ? sql`AND t.transaction_date <= ${toDate}` : sql``;

  const [r] = await db.execute(sql`
    SELECT
      coalesce(sum(t.amount_usd_minor) FILTER (WHERE t.direction='inflow'), 0)::bigint
        AS inflow,
      coalesce(sum(t.amount_usd_minor) FILTER (WHERE t.direction='outflow'), 0)::bigint
        AS outflow,
      count(*) FILTER (WHERE t.direction='inflow')::int AS inflow_count,
      count(*) FILTER (WHERE t.direction='outflow')::int AS outflow_count
    FROM dev_transactions t
    LEFT JOIN dev_cost_categories c ON c.id = t.category_id
    WHERE t.transaction_date >= ${fromDate}
      ${toClause}
      ${projectClause}
      AND t.related_drawdown_id IS NULL
      AND (c.category_type IS NULL OR c.category_type <> 'corporate_event')
  `);

  const r2 = (r ?? {}) as Record<string, unknown>;
  const inflow = BigInt(toStr(r2.inflow));
  const outflow = BigInt(toStr(r2.outflow));
  return {
    inflowUsdMinor: inflow.toString(),
    outflowUsdMinor: outflow.toString(),
    netUsdMinor: (inflow - outflow).toString(),
    inflowCount: Number(r2.inflow_count ?? 0),
    outflowCount: Number(r2.outflow_count ?? 0),
  };
}
