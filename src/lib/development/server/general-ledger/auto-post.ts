import "server-only";

/**
 * GL auto-posting from the finance sub-ledgers, using the STANDARD chart of
 * accounts mapping (operator-approved):
 *   revenue_lines  →  Dr 1000 Cash & Bank   / Cr 4000 Rental Revenue
 *   expense_lines  →  Dr 5000 Operating Exp  / Cr 1000 Cash & Bank
 *
 * postJournal() is idempotent on the (source table, id) key, so re-running is
 * safe — already-posted lines return `reused` and create nothing. This is the
 * conservative cash-basis mapping; richer accrual mappings (AR/AP, owner
 * payable, VAT split) layer on later per line type.
 *
 * Money is bigint MINOR units throughout.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { revenueLines, expenseLines } from "@/lib/db/schema/finance";
import { postJournal } from "./post-journal";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AutoPostResult {
  revenuePosted: number;
  expensePosted: number;
  reused: number;
  error?: string;
}

export async function postFinanceToGl(
  organizationId: string,
  limit = 500,
): Promise<AutoPostResult> {
  const db = getDb();
  if (!db) return { revenuePosted: 0, expensePosted: 0, reused: 0 };

  // NOTE: the finance sub-ledgers (revenue_lines / expense_lines) and their
  // projects/villas are single-tenant in the current schema (no org column),
  // so we post all `posted` lines into the caller's org GL. The chart of
  // accounts IS org-scoped, so entries land in the correct ledger.
  let revenuePosted = 0;
  let expensePosted = 0;
  let reused = 0;

  try {
    // ---- Revenue ----
    const revRows = await db
      .select()
      .from(revenueLines)
      .where(eq(revenueLines.status, "posted"))
      .limit(limit);
    for (const r of revRows) {
      const amount = BigInt(r.amountMinor);
      if (amount <= 0n) continue;
      const res = await postJournal({
        organizationId,
        entryDate: r.serviceDate ?? today(),
        currency: r.currency,
        memo: `Revenue: ${r.description}`,
        source: { table: "revenue_lines", id: r.id },
        lines: [
          { accountCode: "1000", debitMinor: amount },
          { accountCode: "4000", creditMinor: amount },
        ],
      });
      if (res.reused) reused++;
      else revenuePosted++;
    }

    // ---- Expense ----
    const expRows = await db
      .select()
      .from(expenseLines)
      .where(eq(expenseLines.status, "posted"))
      .limit(limit);
    for (const e of expRows) {
      const amount = BigInt(e.amountMinor);
      if (amount <= 0n) continue;
      const res = await postJournal({
        organizationId,
        entryDate: e.expenseDate ?? today(),
        currency: e.currency,
        memo: `Expense: ${e.description}`,
        source: { table: "expense_lines", id: e.id },
        lines: [
          { accountCode: "5000", debitMinor: amount },
          { accountCode: "1000", creditMinor: amount },
        ],
      });
      if (res.reused) reused++;
      else expensePosted++;
    }
  } catch (e) {
    return {
      revenuePosted,
      expensePosted,
      reused,
      error: e instanceof Error ? e.message : "Posting failed.",
    };
  }

  return { revenuePosted, expensePosted, reused };
}
