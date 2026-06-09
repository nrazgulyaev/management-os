"use server";

/**
 * Bank-reconciliation match/unmatch actions (GL leg). Writes to
 * `gl_bank_reconciliation_matches` (migration 0136). Each write is
 * permission-gated (requireInternalUser), org-scoped (requireOrgId), and
 * audit-logged. Manual matching only — no PSP, no auto-posting here.
 * Money is bigint MINOR units.
 */

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  requireInternalUser,
  getCurrentUserContext,
} from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { bankTransactions } from "@/lib/db/schema/banking";
import {
  journalEntries,
  journalLines,
} from "@/lib/db/schema/general-ledger";
import { glBankReconciliationMatches } from "@/lib/db/schema/gl-reconciliation";

const RECON_PATH = "/development-os/finance/accounting";

export type ReconActionResult =
  | { ok: true; matchId: string; varianceMinor: string }
  | { ok: false; error: string };

const matchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  journalEntryId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

/**
 * Tie one bank line to one posted journal entry. Validates both belong to
 * the caller's org, computes the absolute variance between the (absolute)
 * bank amount and the entry's net debit magnitude, and persists the match.
 * Idempotent at the bank-line grain via the unique index — a second match
 * on the same line is rejected.
 */
export async function matchBankLineToJournalAction(
  input: z.input<typeof matchSchema>,
): Promise<ReconActionResult> {
  let parsed: z.infer<typeof matchSchema>;
  try {
    parsed = matchSchema.parse(input);
  } catch {
    return { ok: false, error: "Invalid input." };
  }
  try {
    await requireInternalUser();
    const organizationId = await requireOrgId();
    const db = requireDb();

    const [txn] = await db
      .select({
        id: bankTransactions.id,
        amountMinor: bankTransactions.amountMinor,
        currency: bankTransactions.currency,
      })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, parsed.bankTransactionId),
          eq(bankTransactions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!txn) return { ok: false, error: "Bank line not found." };

    const [entry] = await db
      .select({
        id: journalEntries.id,
        status: journalEntries.status,
        netDebit: sql<string>`coalesce((
          select sum(${journalLines.debitMinor})
          from ${journalLines}
          where ${journalLines.entryId} = ${journalEntries.id}
        ), 0)`,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, parsed.journalEntryId),
          eq(journalEntries.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!entry) return { ok: false, error: "Journal entry not found." };
    if (entry.status !== "posted") {
      return { ok: false, error: "Can only match a posted journal entry." };
    }

    const bankAmount = BigInt(txn.amountMinor);
    const bankAbs = bankAmount < 0n ? -bankAmount : bankAmount;
    const entryNet = BigInt(entry.netDebit ?? "0");
    const diff = bankAbs - entryNet;
    const variance = diff < 0n ? -diff : diff;

    const ctx = await getCurrentUserContext();
    let matchId: string;
    try {
      const [row] = await db
        .insert(glBankReconciliationMatches)
        .values({
          organizationId,
          bankTransactionId: parsed.bankTransactionId,
          journalEntryId: parsed.journalEntryId,
          bankAmountMinor: bankAmount,
          currency: txn.currency,
          matchMethod: "manual",
          varianceMinor: variance,
          note: parsed.note ?? null,
          matchedBy: ctx.appUser?.id ?? null,
        })
        .returning({ id: glBankReconciliationMatches.id });
      matchId = row.id;
    } catch {
      // Unique index → this bank line is already matched.
      return { ok: false, error: "This bank line is already matched." };
    }

    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "gl_recon.match",
      entityType: "gl_bank_reconciliation_match",
      entityId: matchId,
      before: null,
      after: {
        organizationId,
        bankTransactionId: parsed.bankTransactionId,
        journalEntryId: parsed.journalEntryId,
        bankAmountMinor: bankAmount.toString(),
        varianceMinor: variance.toString(),
      },
    });

    revalidatePath(RECON_PATH);
    return { ok: true, matchId, varianceMinor: variance.toString() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Match failed.",
    };
  }
}

const unmatchSchema = z.object({ matchId: z.string().uuid() });

/** Break an existing GL reconciliation match. Org-scoped + audit-logged. */
export async function unmatchBankLineFromJournalAction(
  input: z.input<typeof unmatchSchema>,
): Promise<{ ok: boolean; error?: string }> {
  let parsed: z.infer<typeof unmatchSchema>;
  try {
    parsed = unmatchSchema.parse(input);
  } catch {
    return { ok: false, error: "Invalid input." };
  }
  try {
    await requireInternalUser();
    const organizationId = await requireOrgId();
    const db = requireDb();

    const [match] = await db
      .select({
        id: glBankReconciliationMatches.id,
        bankTransactionId: glBankReconciliationMatches.bankTransactionId,
        journalEntryId: glBankReconciliationMatches.journalEntryId,
      })
      .from(glBankReconciliationMatches)
      .where(
        and(
          eq(glBankReconciliationMatches.id, parsed.matchId),
          eq(glBankReconciliationMatches.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!match) return { ok: false, error: "Match not found." };

    await db
      .delete(glBankReconciliationMatches)
      .where(
        and(
          eq(glBankReconciliationMatches.id, parsed.matchId),
          eq(glBankReconciliationMatches.organizationId, organizationId),
        ),
      );

    const ctx = await getCurrentUserContext();
    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "gl_recon.unmatch",
      entityType: "gl_bank_reconciliation_match",
      entityId: parsed.matchId,
      before: {
        bankTransactionId: match.bankTransactionId,
        journalEntryId: match.journalEntryId,
      },
      after: null,
    });

    revalidatePath(RECON_PATH);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unmatch failed.",
    };
  }
}
