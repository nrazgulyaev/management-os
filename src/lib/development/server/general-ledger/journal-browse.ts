import "server-only";

/**
 * GL journal browse + account drill-down read queries.
 *
 * The missing read half of the GL foundation: postJournal() could write
 * balanced entries but nothing anywhere listed them. Pure org-scoped reads
 * over journal_entries / journal_lines / chart_of_accounts — no new tables,
 * no writes, no audit events. Money stays bigint MINOR units; format only
 * at render (formatMoneyMinor).
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  chartOfAccounts,
  journalEntries,
  journalLines,
} from "@/lib/db/schema/general-ledger";

/** Human chip for the polymorphic entry source (source_table). */
const SOURCE_LABELS: Record<string, string> = {
  revenue_lines: "Finance · revenue line",
  expense_lines: "Finance · expense line",
};

export function journalSourceLabel(sourceTable: string | null): string {
  if (!sourceTable) return "Manual";
  return SOURCE_LABELS[sourceTable] ?? sourceTable.replace(/_/g, " ");
}

export interface JournalLineView {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitMinor: bigint;
  creditMinor: bigint;
  lineMemo: string | null;
}

export interface JournalEntryView {
  id: string;
  entryDate: string;
  currency: string;
  memo: string | null;
  sourceTable: string | null;
  sourceId: string | null;
  externalRef: string | null;
  /** posted | void */
  status: string;
  createdAt: Date;
  lines: JournalLineView[];
}

export interface JournalPage {
  entries: JournalEntryView[];
  totalEntries: number;
  postedEntries: number;
  voidEntries: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const EMPTY_JOURNAL_PAGE: JournalPage = {
  entries: [],
  totalEntries: 0,
  postedEntries: 0,
  voidEntries: 0,
  page: 1,
  pageSize: 50,
  hasMore: false,
};

/**
 * Newest-first journal of balanced entries with their lines (account code +
 * name, debit/credit minor). Offset-paginated — the journal is append-only,
 * so offset drift is not a concern at this scale.
 */
export async function listJournalEntries(
  organizationId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<JournalPage> {
  const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize ?? 50), 1), 200);
  const page = Math.max(Math.trunc(opts.page ?? 1), 1);
  const db = getDb();
  if (!db) return { ...EMPTY_JOURNAL_PAGE, page, pageSize };

  const where = eq(journalEntries.organizationId, organizationId);

  const statusCounts = await db
    .select({ status: journalEntries.status, n: sql<string>`count(*)` })
    .from(journalEntries)
    .where(where)
    .groupBy(journalEntries.status);
  let totalEntries = 0;
  let postedEntries = 0;
  let voidEntries = 0;
  for (const r of statusCounts) {
    const n = Number(r.n ?? "0");
    totalEntries += n;
    if (r.status === "posted") postedEntries += n;
    if (r.status === "void") voidEntries += n;
  }

  const headers = await db
    .select({
      id: journalEntries.id,
      entryDate: journalEntries.entryDate,
      currency: journalEntries.currency,
      memo: journalEntries.memo,
      sourceTable: journalEntries.sourceTable,
      sourceId: journalEntries.sourceId,
      externalRef: journalEntries.externalRef,
      status: journalEntries.status,
      createdAt: journalEntries.createdAt,
    })
    .from(journalEntries)
    .where(where)
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const entryIds = headers.map((h) => h.id);
  const lineRows = entryIds.length
    ? await db
        .select({
          id: journalLines.id,
          entryId: journalLines.entryId,
          accountId: journalLines.accountId,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          debitMinor: journalLines.debitMinor,
          creditMinor: journalLines.creditMinor,
          lineMemo: journalLines.lineMemo,
        })
        .from(journalLines)
        .innerJoin(
          chartOfAccounts,
          eq(chartOfAccounts.id, journalLines.accountId),
        )
        .where(
          and(
            eq(journalLines.organizationId, organizationId),
            inArray(journalLines.entryId, entryIds),
          ),
        )
        .orderBy(asc(journalLines.sortOrder), asc(journalLines.createdAt))
    : [];

  const linesByEntry = new Map<string, JournalLineView[]>();
  for (const l of lineRows) {
    const list = linesByEntry.get(l.entryId) ?? [];
    list.push({
      id: l.id,
      accountId: l.accountId,
      accountCode: l.accountCode,
      accountName: l.accountName,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      lineMemo: l.lineMemo,
    });
    linesByEntry.set(l.entryId, list);
  }

  return {
    entries: headers.map((h) => ({
      ...h,
      lines: linesByEntry.get(h.id) ?? [],
    })),
    totalEntries,
    postedEntries,
    voidEntries,
    page,
    pageSize,
    hasMore: page * pageSize < totalEntries,
  };
}

export interface AccountLedgerRow {
  lineId: string;
  entryId: string;
  entryDate: string;
  memo: string | null;
  lineMemo: string | null;
  sourceTable: string | null;
  currency: string;
  debitMinor: bigint;
  creditMinor: bigint;
  /** Account balance (normal-balance direction) AFTER this line. Rows are
   *  newest-first, so the first row's running balance == current balance. */
  runningMinor: bigint;
}

export interface AccountLedger {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    normalBalance: string;
    note: string | null;
  };
  /** Newest-first. Capped at `limit` — see totalLines for the full count. */
  rows: AccountLedgerRow[];
  totalLines: number;
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  /** Signed balance in the account's normal direction (all posted lines). */
  balanceMinor: bigint;
}

/**
 * Drill-down for one trial-balance account: the posted journal lines that
 * compose its balance, newest-first, with a running balance per line.
 * Returns null when the account does not exist in this org.
 */
export async function getAccountLedger(
  organizationId: string,
  accountId: string,
  opts: { limit?: number } = {},
): Promise<AccountLedger | null> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 200), 1), 500);
  const db = getDb();
  if (!db) return null;

  const [account] = await db
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      normalBalance: chartOfAccounts.normalBalance,
      note: chartOfAccounts.note,
    })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.id, accountId),
        eq(chartOfAccounts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!account) return null;

  const postedLinesWhere = and(
    eq(journalLines.organizationId, organizationId),
    eq(journalLines.accountId, accountId),
    eq(journalEntries.status, "posted"),
  );

  const [totals] = await db
    .select({
      n: sql<string>`count(*)`,
      totalDebit: sql<string>`coalesce(sum(${journalLines.debitMinor}), 0)`,
      totalCredit: sql<string>`coalesce(sum(${journalLines.creditMinor}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(postedLinesWhere);

  const totalLines = Number(totals?.n ?? "0");
  const totalDebitMinor = BigInt(totals?.totalDebit ?? "0");
  const totalCreditMinor = BigInt(totals?.totalCredit ?? "0");
  const balanceMinor =
    account.normalBalance === "debit"
      ? totalDebitMinor - totalCreditMinor
      : totalCreditMinor - totalDebitMinor;

  const raw = await db
    .select({
      lineId: journalLines.id,
      entryId: journalLines.entryId,
      entryDate: journalEntries.entryDate,
      memo: journalEntries.memo,
      lineMemo: journalLines.lineMemo,
      sourceTable: journalEntries.sourceTable,
      currency: journalLines.currency,
      debitMinor: journalLines.debitMinor,
      creditMinor: journalLines.creditMinor,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(postedLinesWhere)
    .orderBy(
      desc(journalEntries.entryDate),
      desc(journalLines.createdAt),
      desc(journalLines.id),
    )
    .limit(limit);

  // Walk newest → oldest: the newest line's running balance is the current
  // balance; each older row peels off the newer line's delta. Exact even
  // when the list is capped, because totals cover ALL posted lines.
  let run = balanceMinor;
  const rows: AccountLedgerRow[] = raw.map((r) => {
    const delta =
      account.normalBalance === "debit"
        ? r.debitMinor - r.creditMinor
        : r.creditMinor - r.debitMinor;
    const row: AccountLedgerRow = { ...r, runningMinor: run };
    run -= delta;
    return row;
  });

  return {
    account,
    rows,
    totalLines,
    totalDebitMinor,
    totalCreditMinor,
    balanceMinor,
  };
}
