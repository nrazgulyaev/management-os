"use server";

/**
 * postJournalAction — the UI entry point for the balanced journal-entry
 * composer. Wraps the existing postJournal() choke point (which validates the
 * double-entry invariants and resolves account codes) and was the missing
 * half: the GL had tables + posting + validation + trial balance from the
 * gl-foundation work, but no way for an accountant to post an entry by hand.
 *
 * Amounts arrive from the composer as major-unit strings and are converted to
 * bigint MINOR units here; postJournal + validateJournalEntry remain the
 * binding balance guarantee.
 */

import { revalidatePath } from "next/cache";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import { postJournal } from "./post-journal";
import { JournalValidationError } from "./journal-validation";

export interface ComposerLineInput {
  accountCode: string;
  /** major units, e.g. "1500.00" — exactly one of debit/credit is filled. */
  debit: string;
  credit: string;
  lineMemo?: string;
}

export interface ComposerInput {
  entryDate: string; // YYYY-MM-DD
  currency: string;
  memo?: string;
  lines: ComposerLineInput[];
}

function toMinor(s: string): bigint {
  const n = Number(s);
  if (!s || !Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 100));
}

export async function postJournalAction(
  input: ComposerInput,
): Promise<{ ok: boolean; entryId?: string; error?: string }> {
  const organizationId = await requireOrgId();
  const ctx = await requireInternalUser();

  try {
    const res = await postJournal({
      organizationId,
      entryDate: input.entryDate,
      currency: (input.currency || "USD").toUpperCase(),
      memo: input.memo?.trim() || undefined,
      createdBy: ctx.appUser?.id ?? undefined,
      lines: input.lines
        .filter((l) => l.accountCode)
        .map((l) => {
          const debitMinor = toMinor(l.debit);
          const creditMinor = toMinor(l.credit);
          return {
            accountCode: l.accountCode,
            debitMinor: debitMinor > 0n ? debitMinor : undefined,
            creditMinor: creditMinor > 0n ? creditMinor : undefined,
            lineMemo: l.lineMemo?.trim() || undefined,
          };
        }),
    });
    revalidatePath("/development-os/finance/general-ledger");
    return { ok: true, entryId: res.entryId };
  } catch (e) {
    if (e instanceof JournalValidationError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to post journal entry.",
    };
  }
}
