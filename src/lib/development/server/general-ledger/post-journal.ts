/**
 * postJournal() — the single choke point for all GL writes.
 *
 * Asserts the double-entry invariants (via validateJournalEntry) BEFORE
 * any insert (never writes a half entry), is idempotent on the source
 * ref, and resolves accountCodes to the org's active chart of accounts.
 * Not yet called by any existing action — auto-post wiring into the live
 * insert sites lands in later PRs (each paired with an idempotent
 * backfill). Money is bigint MINOR units throughout.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  chartOfAccounts,
  journalEntries,
  journalLines,
} from "@/lib/db/schema/general-ledger";
import {
  validateJournalEntry,
  JournalValidationError,
  type JournalEntryInput,
} from "./journal-validation";

export type {
  JournalEntryInput,
  JournalLineInput,
} from "./journal-validation";
export { JournalValidationError, validateJournalEntry } from "./journal-validation";

export interface PostJournalResult {
  entryId: string;
  reused: boolean;
}

/**
 * Post a balanced journal entry. Idempotent on `source`. Throws on any
 * invariant violation or unknown account. (Period-lock enforcement is a
 * later hardening step; the column CHECK + the balance assert here are the
 * binding guarantees today.)
 */
export async function postJournal(
  entry: JournalEntryInput,
): Promise<PostJournalResult> {
  const lines = validateJournalEntry(entry);
  const db = getDb();
  if (!db) throw new JournalValidationError("Database is not configured.");
  const currency = entry.currency ?? "USD";

  // Idempotency: one entry per source ref.
  if (entry.source) {
    const [existing] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceTable, entry.source.table),
          eq(journalEntries.sourceId, entry.source.id),
        ),
      )
      .limit(1);
    if (existing) return { entryId: existing.id, reused: true };
  }

  // Resolve accountCode → id within the org.
  const accounts = await db
    .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.organizationId, entry.organizationId),
        eq(chartOfAccounts.isActive, true),
      ),
    );
  const idByCode = new Map(accounts.map((a) => [a.code, a.id]));
  for (const l of lines) {
    if (!idByCode.has(l.accountCode)) {
      throw new JournalValidationError(
        `Account "${l.accountCode}" not found (or inactive) for this organization — seed the chart of accounts first.`,
      );
    }
  }

  const [header] = await db
    .insert(journalEntries)
    .values({
      organizationId: entry.organizationId,
      entryDate: entry.entryDate,
      currency,
      memo: entry.memo ?? null,
      sourceTable: entry.source?.table ?? null,
      sourceId: entry.source?.id ?? null,
      externalRef: entry.externalRef ?? null,
      createdBy: entry.createdBy ?? null,
    })
    .returning({ id: journalEntries.id });

  await db.insert(journalLines).values(
    lines.map((l, i) => ({
      organizationId: entry.organizationId,
      entryId: header.id,
      accountId: idByCode.get(l.accountCode)!,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      currency,
      lineMemo: l.lineMemo ?? null,
      sortOrder: i,
    })),
  );

  return { entryId: header.id, reused: false };
}
