"use server";

/**
 * Wire-up — "use server" adapters for the server-only capital-commitment
 * and drawdown lifecycle actions. Each adapter normalizes to
 * {ok} | {ok:false,error} and revalidates the affected commitments path.
 *
 * The underlying actions already enforce permissions + tenant org-scoping
 * + audit logging (see commitment-actions.ts / drawdown-actions.ts). These
 * wrappers add NO authority — they only adapt the call shape for the UI and
 * convert user-entered *major* amounts to the *minor* units the actions
 * expect (USDT = 6 decimals, everything else = 2).
 */

import { revalidatePath } from "next/cache";
import {
  createCommitment,
  updateCommitmentTerms,
  cancelCommitment,
  closeCommitment,
} from "@/lib/development/server/commitment-actions";
import {
  requestDrawdown,
  confirmDrawdownReceipt,
  cancelDrawdown,
} from "@/lib/development/server/drawdown-actions";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/development/constants/investor-constants";

const LIST_PATH = "/development-os/commitments";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Convert a major-unit amount string ("250000.50") to minor units (BIGINT-as-string). */
function majorToMinorString(major: string, currency: SupportedCurrency): string {
  const n = Number(major);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const divisor = currency === "USDT" ? 1_000_000 : 100;
  return String(Math.round(n * divisor));
}

function isCurrency(v: string): v is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

// ---------------------------------------------------------------------------
// Commitment create
// ---------------------------------------------------------------------------

export interface CreateCommitmentFormInput {
  investorId: string;
  projectId: string | null;
  commitmentCode: string;
  committedAmountMajor: string;
  committedCurrency: string;
  fxRateAtCommitment: string;
  profitSharePercent: string;
  capitalReturnPriority: number;
  signedAt?: string | null;
  notes?: string | null;
}

export async function createCommitmentAction(
  input: CreateCommitmentFormInput,
): Promise<ActionResult> {
  try {
    if (!isCurrency(input.committedCurrency)) {
      throw new Error("Unsupported currency.");
    }
    await createCommitment({
      investorId: input.investorId,
      projectId: input.projectId,
      commitmentCode: input.commitmentCode,
      committedAmountMinor: majorToMinorString(
        input.committedAmountMajor,
        input.committedCurrency,
      ),
      committedCurrency: input.committedCurrency,
      fxRateAtCommitment: input.fxRateAtCommitment,
      profitSharePercent: input.profitSharePercent,
      capitalReturnPriority: input.capitalReturnPriority,
      signedAt: input.signedAt || null,
      notes: input.notes || null,
    });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to create commitment.");
  }
}

// ---------------------------------------------------------------------------
// Commitment lifecycle (edit terms / cancel / close)
// ---------------------------------------------------------------------------

export interface UpdateCommitmentTermsFormInput {
  id: string;
  profitSharePercent?: string;
  capitalReturnPriority?: number;
  signedAt?: string | null;
  notes?: string | null;
}

export async function updateCommitmentTermsAction(
  input: UpdateCommitmentTermsFormInput,
): Promise<ActionResult> {
  try {
    await updateCommitmentTerms(input.id, {
      ...(input.profitSharePercent !== undefined && {
        profitSharePercent: input.profitSharePercent,
      }),
      ...(input.capitalReturnPriority !== undefined && {
        capitalReturnPriority: input.capitalReturnPriority,
      }),
      ...(input.signedAt !== undefined && { signedAt: input.signedAt || null }),
      ...(input.notes !== undefined && { notes: input.notes || null }),
    });
    revalidatePath(`${LIST_PATH}/${input.id}`);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to update commitment terms.");
  }
}

export async function cancelCommitmentAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await cancelCommitment(id, reason);
    revalidatePath(`${LIST_PATH}/${id}`);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to cancel commitment.");
  }
}

export async function closeCommitmentAction(id: string): Promise<ActionResult> {
  try {
    await closeCommitment(id);
    revalidatePath(`${LIST_PATH}/${id}`);
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to close commitment.");
  }
}

// ---------------------------------------------------------------------------
// Drawdowns (request capital call / confirm receipt / cancel)
// ---------------------------------------------------------------------------

export interface RequestDrawdownFormInput {
  commitmentId: string;
  amountMajor: string;
  currency: string;
  fxRateAtDrawdown: string;
  dueDate: string;
  triggerReason: string;
  notes?: string | null;
}

export async function requestDrawdownAction(
  input: RequestDrawdownFormInput,
): Promise<ActionResult> {
  try {
    if (!isCurrency(input.currency)) {
      throw new Error("Unsupported currency.");
    }
    await requestDrawdown({
      commitmentId: input.commitmentId,
      amountMinor: majorToMinorString(input.amountMajor, input.currency),
      currency: input.currency,
      fxRateAtDrawdown: input.fxRateAtDrawdown,
      dueDate: input.dueDate,
      triggerReason: input.triggerReason as never,
      notes: input.notes || null,
    });
    revalidatePath(`${LIST_PATH}/${input.commitmentId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to request capital call.");
  }
}

export interface ConfirmDrawdownFormInput {
  commitmentId: string;
  drawdownId: string;
  receivedAt?: string;
  paymentMethod: string;
  paymentReference?: string | null;
}

export async function confirmDrawdownReceiptAction(
  input: ConfirmDrawdownFormInput,
): Promise<ActionResult> {
  try {
    await confirmDrawdownReceipt({
      drawdownId: input.drawdownId,
      receivedAt: input.receivedAt || undefined,
      paymentMethod: input.paymentMethod as never,
      paymentReference: input.paymentReference || null,
    });
    revalidatePath(`${LIST_PATH}/${input.commitmentId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to confirm drawdown receipt.");
  }
}

export async function cancelDrawdownAction(
  commitmentId: string,
  drawdownId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await cancelDrawdown(drawdownId, reason);
    revalidatePath(`${LIST_PATH}/${commitmentId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to cancel drawdown.");
  }
}
