"use server";

/**
 * Wire-up — "use server" adapters for the approval-threshold matrix CRUD.
 *
 * The underlying actions in
 *   src/lib/development/server/procurement/procurement-actions.ts
 * (createApprovalThreshold / updateApprovalThreshold /
 *  deactivateApprovalThreshold) are positional + throw-on-error and already
 * enforce the director-role gate. These wrappers add NO authority — they only
 * adapt the call shape for the client island: normalize to
 *   {ok:true} | {ok:false, error}
 * convert user-entered *major* amounts to the *minor* BIGINT units the action
 * expects, and revalidate the settings page so the table reflects the change.
 */

import { revalidatePath } from "next/cache";
import {
  createApprovalThreshold,
  updateApprovalThreshold,
  deactivateApprovalThreshold,
} from "@/lib/development/server/procurement/procurement-actions";

const PAGE_PATH = "/development-os/settings/approval-thresholds";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Minor-unit decimals per currency. USDT settles at 6 decimals, fiat at 2. */
function minorDecimals(currency: string): number {
  return currency.toUpperCase() === "USDT" ? 6 : 2;
}

/**
 * Convert a major-unit amount string ("1500" / "1500.50") to a minor-unit
 * BIGINT string. Empty / null → null (used for the "no upper limit" max).
 */
function majorToMinor(
  major: string | null | undefined,
  currency: string,
  { allowNull = false }: { allowNull?: boolean } = {},
): bigint | null {
  const trimmed = (major ?? "").trim();
  if (trimmed === "") {
    if (allowNull) return null;
    throw new Error("Amount is required.");
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Amount must be a non-negative number.");
  }
  return BigInt(Math.round(n * 10 ** minorDecimals(currency)));
}

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

export interface ThresholdFormInput {
  thresholdType: string;
  amountMinMajor: string;
  amountMaxMajor?: string | null;
  currency: string;
  requiredRole: string;
  requiredApproverCount: number;
  notes?: string | null;
}

export async function createApprovalThresholdAction(
  input: ThresholdFormInput,
): Promise<ActionResult> {
  try {
    const currency = input.currency.trim().toUpperCase();
    await createApprovalThreshold({
      thresholdType: input.thresholdType,
      amountMinorMin: majorToMinor(input.amountMinMajor, currency)!,
      amountMinorMax: majorToMinor(input.amountMaxMajor, currency, {
        allowNull: true,
      }),
      currency,
      requiredRole: input.requiredRole,
      requiredApproverCount: input.requiredApproverCount,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to add approval tier.");
  }
}

export async function updateApprovalThresholdAction(
  id: string,
  input: ThresholdFormInput,
): Promise<ActionResult> {
  try {
    const currency = input.currency.trim().toUpperCase();
    await updateApprovalThreshold(id, {
      thresholdType: input.thresholdType,
      amountMinorMin: majorToMinor(input.amountMinMajor, currency)!,
      amountMinorMax: majorToMinor(input.amountMaxMajor, currency, {
        allowNull: true,
      }),
      currency,
      requiredRole: input.requiredRole,
      requiredApproverCount: input.requiredApproverCount,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    });
    revalidatePath(PAGE_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to update approval tier.");
  }
}

export async function deactivateApprovalThresholdAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deactivateApprovalThreshold(id);
    revalidatePath(PAGE_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to deactivate approval tier.");
  }
}
