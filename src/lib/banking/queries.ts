import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bankConnections,
  bankTransactions,
  closedPeriods,
  reconciliationRules,
  statementImports,
  type MatchStatus,
} from "@/lib/db/schema/banking";

/**
 * Stage 6.P3.G — Read queries for the bookkeeper UI.
 *
 * RLS at the DB layer keeps per-org isolation honest; we don't
 * filter by organization_id here.
 */

export async function listBankConnectionsForUi() {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: bankConnections.id,
      provider: bankConnections.provider,
      externalAccountId: bankConnections.externalAccountId,
      accountName: bankConnections.accountName,
      currency: bankConnections.currency,
      status: bankConnections.status,
      lastSyncedAt: bankConnections.lastSyncedAt,
      lastSyncStatus: bankConnections.lastSyncStatus,
      lastSyncError: bankConnections.lastSyncError,
    })
    .from(bankConnections)
    .orderBy(desc(bankConnections.createdAt))
    .limit(200);
}

export async function listBankTransactionsForUi(opts: {
  matchStatus?: MatchStatus;
  unmatchedOnly?: boolean;
  uncategorizedOnly?: boolean;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  const conds = [] as ReturnType<typeof eq>[];
  if (opts.matchStatus) {
    conds.push(eq(bankTransactions.matchStatus, opts.matchStatus));
  }
  if (opts.unmatchedOnly) {
    conds.push(
      eq(bankTransactions.matchStatus, "unmatched" as MatchStatus) as never,
    );
  }
  if (opts.uncategorizedOnly) {
    conds.push(isNull(bankTransactions.categoryId) as never);
  }
  const where = conds.length > 0 ? and(...conds) : sql`true`;
  return db
    .select({
      id: bankTransactions.id,
      bankConnectionId: bankTransactions.bankConnectionId,
      transactionDate: bankTransactions.transactionDate,
      amountMinor: bankTransactions.amountMinor,
      currency: bankTransactions.currency,
      description: bankTransactions.description,
      counterpartyName: bankTransactions.counterpartyName,
      matchStatus: bankTransactions.matchStatus,
      matchConfidence: bankTransactions.matchConfidence,
      matchedInvoiceId: bankTransactions.matchedInvoiceId,
      categoryId: bankTransactions.categoryId,
      isPending: bankTransactions.isPending,
    })
    .from(bankTransactions)
    .where(where)
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(opts.limit ?? 200);
}

export async function listStatementImportsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(statementImports)
    .orderBy(desc(statementImports.uploadedAt))
    .limit(opts.limit ?? 100);
}

export async function listReconciliationRulesForUi() {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(reconciliationRules)
    .orderBy(reconciliationRules.priority);
}

export async function listClosedPeriodsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(closedPeriods)
    .orderBy(desc(closedPeriods.periodEnd))
    .limit(opts.limit ?? 24);
}

export async function getReconciliationStats() {
  const db = getDb();
  if (!db) return { unmatched: 0, partial: 0, matched: 0 };
  const rows = await db
    .select({
      status: bankTransactions.matchStatus,
      total: sql<number>`count(*)::int`,
    })
    .from(bankTransactions)
    .groupBy(bankTransactions.matchStatus);
  const out = { unmatched: 0, partial: 0, matched: 0 };
  for (const r of rows) {
    if (r.status === "unmatched") out.unmatched += Number(r.total);
    else if (r.status === "partial_match") out.partial += Number(r.total);
    else if (
      r.status === "auto_matched" ||
      r.status === "manually_matched"
    )
      out.matched += Number(r.total);
  }
  return out;
}
