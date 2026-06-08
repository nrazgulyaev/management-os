/**
 * Trial balance + chart-of-accounts read queries for the GL foundation.
 * Pure aggregates over journal_lines — no new table. Money stays bigint
 * minor units; format only at render.
 */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  chartOfAccounts,
  journalEntries,
  journalLines,
} from "@/lib/db/schema/general-ledger";

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  debitMinor: bigint;
  creditMinor: bigint;
  /** Signed balance in the account's normal direction. */
  balanceMinor: bigint;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  /** Whole-ledger tie-out: debits === credits across all posted lines. */
  balanced: boolean;
}

export async function getTrialBalance(
  organizationId: string,
  asOf?: string,
): Promise<TrialBalance> {
  const db = getDb();
  if (!db) {
    return { rows: [], totalDebitMinor: 0n, totalCreditMinor: 0n, balanced: true };
  }

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
        asOf ? lte(journalEntries.entryDate, asOf) : undefined,
      ),
    )
    .groupBy(
      chartOfAccounts.code,
      chartOfAccounts.name,
      chartOfAccounts.type,
      chartOfAccounts.normalBalance,
    )
    .orderBy(asc(chartOfAccounts.code));

  let totalDebitMinor = 0n;
  let totalCreditMinor = 0n;
  const rows: TrialBalanceRow[] = raw.map((r) => {
    const debit = BigInt(r.totalDebit ?? "0");
    const credit = BigInt(r.totalCredit ?? "0");
    totalDebitMinor += debit;
    totalCreditMinor += credit;
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

  return {
    rows,
    totalDebitMinor,
    totalCreditMinor,
    balanced: totalDebitMinor === totalCreditMinor,
  };
}

export async function listGlAccounts(organizationId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.organizationId, organizationId))
    .orderBy(asc(chartOfAccounts.code));
}
