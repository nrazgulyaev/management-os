"use server";

/**
 * Wave D — "use server" adapters for the transaction inline-edit controls
 * (allocation split / reconcile / link-to-commitment). The underlying
 * actions are org-scoped + audited in transaction-actions.ts; these wrap
 * them with a normalized {ok,error} result + revalidatePath so the
 * co-located client drawer can call them without trusting client input.
 */

import { revalidatePath } from "next/cache";
import {
  reconcileTransaction,
  splitTransactionAllocation,
  linkTransactionToCommitmentLedger,
} from "@/lib/development/server/transaction-actions";

type Result = { ok: true } | { ok: false; error: string };

function path(id: string): string {
  return `/development-os/finance/transactions/${id}`;
}

export async function reconcileTransactionAction(
  transactionId: string,
  statementLineRef: string,
): Promise<Result> {
  try {
    await reconcileTransaction(transactionId, statementLineRef);
    revalidatePath(path(transactionId));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Reconcile failed.",
    };
  }
}

export async function splitAllocationAction(
  transactionId: string,
  allocationMap: Record<string, number>,
): Promise<Result> {
  try {
    await splitTransactionAllocation({ transactionId, allocationMap });
    revalidatePath(path(transactionId));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Allocation split failed.",
    };
  }
}

export async function linkCommitmentAction(
  transactionId: string,
  commitmentLedgerId: string,
): Promise<Result> {
  try {
    await linkTransactionToCommitmentLedger(transactionId, commitmentLedgerId);
    revalidatePath(path(transactionId));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Link to commitment failed.",
    };
  }
}
