import "server-only";

/**
 * Bank-reconciliation matching against the GL.
 *
 * Reads + actions for tying an imported bank line (`bank_transactions`) to
 * a posted GL journal entry (`journal_entries`), persisted in
 * `gl_bank_reconciliation_matches` (migration 0136). The existing
 * reconciliation layer matches bank lines to invoices / dev-transactions;
 * this is the GL leg the contract names ("match imported bank lines to
 * GL/journal entries"). Money stays bigint MINOR units. Every write is
 * permission-gated, org-scoped, and audit-logged.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bankTransactions } from "@/lib/db/schema/banking";
import {
  journalEntries,
  journalLines,
} from "@/lib/db/schema/general-ledger";
import { glBankReconciliationMatches } from "@/lib/db/schema/gl-reconciliation";

export interface UnmatchedBankLine {
  id: string;
  transactionDate: string;
  description: string;
  counterpartyName: string | null;
  amountMinor: bigint;
  currency: string;
}

export interface MatchedBankLine extends UnmatchedBankLine {
  matchId: string;
  journalEntryId: string;
  journalMemo: string | null;
  journalEntryDate: string;
  varianceMinor: bigint;
  matchMethod: string;
}

export interface JournalEntryCandidate {
  id: string;
  entryDate: string;
  memo: string | null;
  /** Net debit-side magnitude of the entry (minor units). */
  netMinor: bigint;
  currency: string;
}

export interface BankReconciliationView {
  unmatched: UnmatchedBankLine[];
  matched: MatchedBankLine[];
  candidates: JournalEntryCandidate[];
  matchedCount: number;
  unmatchedCount: number;
}

/** Bank lines for this org that have no GL match yet (left join is null). */
async function listUnmatchedBankLines(
  organizationId: string,
  limit: number,
): Promise<UnmatchedBankLine[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: bankTransactions.id,
      transactionDate: bankTransactions.transactionDate,
      description: bankTransactions.description,
      counterpartyName: bankTransactions.counterpartyName,
      amountMinor: bankTransactions.amountMinor,
      currency: bankTransactions.currency,
    })
    .from(bankTransactions)
    .leftJoin(
      glBankReconciliationMatches,
      eq(glBankReconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .where(
      and(
        eq(bankTransactions.organizationId, organizationId),
        isNull(glBankReconciliationMatches.id),
      ),
    )
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    transactionDate: String(r.transactionDate),
    description: r.description,
    counterpartyName: r.counterpartyName,
    amountMinor: BigInt(r.amountMinor),
    currency: r.currency,
  }));
}

/** Bank lines for this org already tied to a journal entry. */
async function listMatchedBankLines(
  organizationId: string,
  limit: number,
): Promise<MatchedBankLine[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      matchId: glBankReconciliationMatches.id,
      journalEntryId: glBankReconciliationMatches.journalEntryId,
      varianceMinor: glBankReconciliationMatches.varianceMinor,
      matchMethod: glBankReconciliationMatches.matchMethod,
      txnId: bankTransactions.id,
      transactionDate: bankTransactions.transactionDate,
      description: bankTransactions.description,
      counterpartyName: bankTransactions.counterpartyName,
      amountMinor: bankTransactions.amountMinor,
      currency: bankTransactions.currency,
      journalMemo: journalEntries.memo,
      journalEntryDate: journalEntries.entryDate,
    })
    .from(glBankReconciliationMatches)
    .innerJoin(
      bankTransactions,
      eq(bankTransactions.id, glBankReconciliationMatches.bankTransactionId),
    )
    .innerJoin(
      journalEntries,
      eq(journalEntries.id, glBankReconciliationMatches.journalEntryId),
    )
    .where(eq(glBankReconciliationMatches.organizationId, organizationId))
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(limit);
  return rows.map((r) => ({
    matchId: r.matchId,
    journalEntryId: r.journalEntryId,
    journalMemo: r.journalMemo,
    journalEntryDate: String(r.journalEntryDate),
    varianceMinor: BigInt(r.varianceMinor),
    matchMethod: r.matchMethod,
    id: r.txnId,
    transactionDate: String(r.transactionDate),
    description: r.description,
    counterpartyName: r.counterpartyName,
    amountMinor: BigInt(r.amountMinor),
    currency: r.currency,
  }));
}

/** Posted journal entries available to match, with their net magnitude. */
async function listJournalCandidates(
  organizationId: string,
  limit: number,
): Promise<JournalEntryCandidate[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: journalEntries.id,
      entryDate: journalEntries.entryDate,
      memo: journalEntries.memo,
      currency: journalEntries.currency,
      netDebit: sql<string>`coalesce(sum(${journalLines.debitMinor}), 0)`,
    })
    .from(journalEntries)
    .leftJoin(journalLines, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.organizationId, organizationId),
        eq(journalEntries.status, "posted"),
      ),
    )
    .groupBy(
      journalEntries.id,
      journalEntries.entryDate,
      journalEntries.memo,
      journalEntries.currency,
    )
    .orderBy(desc(journalEntries.entryDate))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    entryDate: String(r.entryDate),
    memo: r.memo,
    netMinor: BigInt(r.netDebit ?? "0"),
    currency: r.currency,
  }));
}

/** One-shot loader for the reconciliation tab. */
export async function getBankReconciliationView(
  organizationId: string,
  opts: { limit?: number } = {},
): Promise<BankReconciliationView> {
  const limit = opts.limit ?? 100;
  const [unmatched, matched, candidates] = await Promise.all([
    listUnmatchedBankLines(organizationId, limit),
    listMatchedBankLines(organizationId, limit),
    listJournalCandidates(organizationId, limit),
  ]);
  return {
    unmatched,
    matched,
    candidates,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
  };
}
