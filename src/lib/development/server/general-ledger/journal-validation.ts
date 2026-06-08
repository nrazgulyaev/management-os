/**
 * Pure double-entry invariants for the GL (no DB / no "server-only") so
 * they're unit-testable and importable from scripts. postJournal() in
 * post-journal.ts calls validateJournalEntry before any insert.
 */

export interface JournalLineInput {
  /** chart_of_accounts.code, resolved to an active account within the org. */
  accountCode: string;
  /** Exactly one of debitMinor / creditMinor must be > 0. */
  debitMinor?: bigint;
  creditMinor?: bigint;
  lineMemo?: string;
}

export interface JournalEntryInput {
  organizationId: string;
  entryDate: string; // 'YYYY-MM-DD'
  currency?: string; // default 'USD'; all lines share the entry currency
  memo?: string;
  /** Idempotency key — one entry per (table,id). */
  source?: { table: string; id: string };
  externalRef?: string;
  createdBy?: string;
  lines: JournalLineInput[];
}

export interface NormalizedLine {
  accountCode: string;
  debitMinor: bigint;
  creditMinor: bigint;
  lineMemo?: string;
}

export class JournalValidationError extends Error {}

/**
 * Pure invariant check (no DB). Throws JournalValidationError on any
 * violation. Returns the per-line normalized {debit,credit} bigints.
 *
 * Invariants: ≥2 lines; each line exactly one of debit/credit nonzero,
 * both non-negative bigint; sum(debit) === sum(credit) (entry nets to
 * zero).
 */
export function validateJournalEntry(entry: JournalEntryInput): NormalizedLine[] {
  if (!entry.organizationId) {
    throw new JournalValidationError("organizationId is required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.entryDate)) {
    throw new JournalValidationError("entryDate must be YYYY-MM-DD.");
  }
  if (!Array.isArray(entry.lines) || entry.lines.length < 2) {
    throw new JournalValidationError("A journal entry needs at least 2 lines.");
  }

  let sumDebit = 0n;
  let sumCredit = 0n;
  const normalized = entry.lines.map((l, i) => {
    const debit = l.debitMinor ?? 0n;
    const credit = l.creditMinor ?? 0n;
    if (typeof debit !== "bigint" || typeof credit !== "bigint") {
      throw new JournalValidationError(`Line ${i}: amounts must be bigint minor units.`);
    }
    if (debit < 0n || credit < 0n) {
      throw new JournalValidationError(`Line ${i}: amounts must be non-negative.`);
    }
    if ((debit === 0n) === (credit === 0n)) {
      throw new JournalValidationError(
        `Line ${i}: exactly one of debit/credit must be nonzero.`,
      );
    }
    if (!l.accountCode) {
      throw new JournalValidationError(`Line ${i}: accountCode is required.`);
    }
    sumDebit += debit;
    sumCredit += credit;
    return {
      accountCode: l.accountCode,
      debitMinor: debit,
      creditMinor: credit,
      lineMemo: l.lineMemo,
    };
  });

  if (sumDebit !== sumCredit) {
    throw new JournalValidationError(
      `Entry is not balanced: debits ${sumDebit} ≠ credits ${sumCredit}.`,
    );
  }
  return normalized;
}
