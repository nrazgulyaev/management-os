import "server-only";

/**
 * Financial statements — Balance Sheet + Income Statement / P&L.
 *
 * PURE derivations over the existing double-entry GL (journal_lines +
 * chart_of_accounts). No new tables: the trial balance IS the source of
 * truth. Money stays bigint MINOR units; format only at render. Every
 * query is org-scoped (caller passes the org id from requireOrgId()).
 *
 *   Balance Sheet  — asset / liability / equity balances AS OF a date.
 *   Income Stmt    — revenue / expense activity FOR a period [from, to].
 *
 * The accounting identity (Assets = Liabilities + Equity + Net Income for
 * the period) is computed and surfaced so the desk can prove it ties.
 */

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  chartOfAccounts,
  journalEntries,
  journalLines,
} from "@/lib/db/schema/general-ledger";

export interface StatementLine {
  code: string;
  name: string;
  /** Balance in the account's natural presentation direction (minor units). */
  amountMinor: bigint;
}

export interface StatementGroup {
  /** asset | liability | equity | revenue | expense */
  type: string;
  label: string;
  lines: StatementLine[];
  subtotalMinor: bigint;
}

export interface BalanceSheet {
  asOf: string;
  assets: StatementGroup;
  liabilities: StatementGroup;
  equity: StatementGroup;
  totalAssetsMinor: bigint;
  totalLiabilitiesMinor: bigint;
  totalEquityMinor: bigint;
  /** Net income for the year-to-date implied by revenue − expense at asOf. */
  retainedFromIncomeMinor: bigint;
  /** Assets − (Liabilities + Equity + retained-from-income). 0 = balanced. */
  imbalanceMinor: bigint;
  balanced: boolean;
}

export interface IncomeStatement {
  from: string;
  to: string;
  revenue: StatementGroup;
  expense: StatementGroup;
  totalRevenueMinor: bigint;
  totalExpenseMinor: bigint;
  netIncomeMinor: bigint;
}

const TYPE_LABEL: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

interface RawBalance {
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  debitMinor: bigint;
  creditMinor: bigint;
  /** Signed in the account's normal direction. */
  balanceMinor: bigint;
}

/**
 * Aggregate posted journal lines per account, summing debits/credits over a
 * date window. `from`/`to` are inclusive ISO dates; omit `from` for a
 * cumulative (as-of) balance — used by the Balance Sheet.
 */
async function accountBalances(
  organizationId: string,
  opts: { from?: string; to?: string } = {},
): Promise<RawBalance[]> {
  const db = getDb();
  if (!db) return [];
  const raw = await db
    .select({
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      normalBalance: chartOfAccounts.normalBalance,
      totalDebit: sql<string>`coalesce(sum(${journalLines.debitMinor}), 0)`,
      totalCredit: sql<string>`coalesce(sum(${journalLines.creditMinor}), 0)`,
    })
    .from(journalLines)
    .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalLines.accountId))
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.organizationId, organizationId),
        eq(journalEntries.status, "posted"),
        opts.from ? gte(journalEntries.entryDate, opts.from) : undefined,
        opts.to ? lte(journalEntries.entryDate, opts.to) : undefined,
      ),
    )
    .groupBy(
      chartOfAccounts.code,
      chartOfAccounts.name,
      chartOfAccounts.type,
      chartOfAccounts.normalBalance,
    )
    .orderBy(asc(chartOfAccounts.code));

  return raw.map((r) => {
    const debit = BigInt(r.totalDebit ?? "0");
    const credit = BigInt(r.totalCredit ?? "0");
    const balanceMinor =
      r.normalBalance === "debit" ? debit - credit : credit - debit;
    return {
      code: r.code,
      name: r.name,
      type: r.type,
      normalBalance: r.normalBalance,
      debitMinor: debit,
      creditMinor: credit,
      balanceMinor,
    };
  });
}

function group(rows: RawBalance[], type: string): StatementGroup {
  const lines = rows
    .filter((r) => r.type === type && r.balanceMinor !== 0n)
    .map((r) => ({ code: r.code, name: r.name, amountMinor: r.balanceMinor }));
  const subtotalMinor = lines.reduce((acc, l) => acc + l.amountMinor, 0n);
  return { type, label: TYPE_LABEL[type] ?? type, lines, subtotalMinor };
}

/**
 * Balance Sheet AS OF a date. Asset/liability/equity balances are
 * cumulative (everything posted on or before `asOf`). Period net income
 * (revenue − expense, cumulative to asOf) is surfaced separately because
 * it has not been closed to retained earnings — so the tie-out is
 * Assets = Liabilities + Equity + retained-from-income.
 */
export async function getBalanceSheet(
  organizationId: string,
  asOf?: string,
): Promise<BalanceSheet> {
  const at = asOf ?? new Date().toISOString().slice(0, 10);
  const rows = await accountBalances(organizationId, { to: at });

  const assets = group(rows, "asset");
  const liabilities = group(rows, "liability");
  const equity = group(rows, "equity");

  const revenueTotal = rows
    .filter((r) => r.type === "revenue")
    .reduce((acc, r) => acc + r.balanceMinor, 0n);
  const expenseTotal = rows
    .filter((r) => r.type === "expense")
    .reduce((acc, r) => acc + r.balanceMinor, 0n);
  const retainedFromIncomeMinor = revenueTotal - expenseTotal;

  const totalAssetsMinor = assets.subtotalMinor;
  const totalLiabilitiesMinor = liabilities.subtotalMinor;
  const totalEquityMinor = equity.subtotalMinor;

  const imbalanceMinor =
    totalAssetsMinor -
    (totalLiabilitiesMinor + totalEquityMinor + retainedFromIncomeMinor);

  return {
    asOf: at,
    assets,
    liabilities,
    equity,
    totalAssetsMinor,
    totalLiabilitiesMinor,
    totalEquityMinor,
    retainedFromIncomeMinor,
    imbalanceMinor,
    balanced: imbalanceMinor === 0n,
  };
}

/**
 * Income Statement / P&L for a period [from, to] (inclusive ISO dates).
 * Revenue and expense are period activity only (not cumulative). Net
 * income = revenue − expense.
 */
export async function getIncomeStatement(
  organizationId: string,
  from: string,
  to: string,
): Promise<IncomeStatement> {
  const rows = await accountBalances(organizationId, { from, to });
  const revenue = group(rows, "revenue");
  const expense = group(rows, "expense");
  return {
    from,
    to,
    revenue,
    expense,
    totalRevenueMinor: revenue.subtotalMinor,
    totalExpenseMinor: expense.subtotalMinor,
    netIncomeMinor: revenue.subtotalMinor - expense.subtotalMinor,
  };
}
