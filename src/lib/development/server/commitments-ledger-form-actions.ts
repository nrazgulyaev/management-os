"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUser } from "@/features/auth/permissions";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import {
  cancelCommitmentLedger,
  updateCommitmentLedgerStatus,
} from "./commitments-ledger-actions";
import { recordTransaction } from "./transaction-actions";

/**
 * Commitments lifecycle — `"use server"` form surface for the client
 * `_controls.tsx` island. The underlying lifecycle logic lives in the
 * `server-only` `commitments-ledger-actions.ts` (create / status / cancel)
 * and in `transaction-actions.ts` (record-transaction, which auto-recomputes
 * the linked commitment's status open → partially_paid → completed). These
 * wrappers add permission-gating, a FormData boundary, and path revalidation
 * so the detail page refreshes after a write.
 *
 * Money stays in BIGINT minor units throughout. Mark-paid is MANUAL only —
 * there is no real PSP (Indonesia rails deferred to launch), so paying a
 * commitment means recording an `outflow` dev_transactions row against it.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Cancel a commitment (reason required, min 3 chars). */
export async function cancelCommitmentLedgerAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "");
    const reason = String(formData.get("reason") ?? "");
    if (!id) return fail("Missing commitment id.");
    if (reason.trim().length < 3) {
      return fail("A cancellation reason (min 3 chars) is required.");
    }
    await cancelCommitmentLedger(id, reason.trim());
    revalidatePath(`/development-os/finance/commitments/${id}`);
    revalidatePath("/development-os/finance/commitments");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const STATUSES = [
  "open",
  "partially_paid",
  "completed",
  "cancelled",
] as const;

/**
 * Manual status override. Normally status is derived automatically from
 * accumulated payments; this is the operator escape hatch (e.g. closing a
 * PO early). Audit-logged inside `updateCommitmentLedgerStatus`.
 */
export async function updateCommitmentLedgerStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "");
    if (!id) return fail("Missing commitment id.");
    if (!(STATUSES as readonly string[]).includes(status)) {
      return fail("Invalid status.");
    }
    await updateCommitmentLedgerStatus(
      id,
      status as (typeof STATUSES)[number],
    );
    revalidatePath(`/development-os/finance/commitments/${id}`);
    revalidatePath("/development-os/finance/commitments");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const markPaidSchema = z.object({
  commitmentId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  amountMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  projectId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
});

/**
 * Record a MANUAL payment against a commitment. Inserts an `outflow`
 * dev_transactions row linked via `relatedCommitmentId`, which makes
 * `recordTransaction` recompute the commitment's status (open →
 * partially_paid → completed) inside the same DB transaction. No new
 * mark-paid logic is invented — the accumulation lives in
 * transaction-actions.ts.
 */
export async function markCommitmentPaidAction(formData: FormData): Promise<
  | { ok: true; transactionCode: string }
  | { ok: false; error: string }
> {
  try {
    await requireInternalUser();
    const parsed = markPaidSchema.safeParse({
      commitmentId: formData.get("commitmentId"),
      bankAccountId: formData.get("bankAccountId"),
      amountMinor: formData.get("amountMinor"),
      currency: formData.get("currency"),
      fxRate: formData.get("fxRate") || "1",
      transactionDate: formData.get("transactionDate"),
      description: formData.get("description"),
      projectId: formData.get("projectId") || undefined,
      categoryId: formData.get("categoryId") || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid payment input.",
      };
    }
    const out = await recordTransaction({
      bankAccountId: parsed.data.bankAccountId,
      direction: "outflow",
      relatedCommitmentId: parsed.data.commitmentId,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      fxRateAtTransaction: parsed.data.fxRate,
      transactionDate: parsed.data.transactionDate,
      description: parsed.data.description,
      projectId: parsed.data.projectId ?? null,
      categoryId: parsed.data.categoryId ?? null,
    });
    revalidatePath(
      `/development-os/finance/commitments/${parsed.data.commitmentId}`,
    );
    revalidatePath("/development-os/finance/commitments");
    return { ok: true, transactionCode: out.transactionCode };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
