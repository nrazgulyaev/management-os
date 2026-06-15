"use server";

/**
 * Wire-up sweep — "use server" adapters for the server-only capital-account
 * wallet-movement actions, normalized to {ok,error} + revalidate. These are
 * thin pass-throughs: the underlying actions already enforce permissions,
 * org-scoping and audit logging. We add NO authority here.
 *
 * Money note: the forms collect a positive USD *dollar* amount as a string;
 * we convert it to a signed minor-unit BigInt here (parsed via string to
 * avoid float drift). `recordWalletMovement.amountMinor` is signed — a debit
 * direction flips the sign; `recordCrossProjectMovement.amountMinor` is
 * always positive (the action writes the signed pair itself).
 */

import { revalidatePath } from "next/cache";
import {
  recordWalletMovement,
  reverseWalletMovement,
  recordCrossProjectMovement,
} from "@/lib/development/server/capital-account/capital-account-actions";

function pathFor(code: string) {
  return `/development-os/investors/${code}/capital-account`;
}

/**
 * Parse a human-entered USD amount ("1,250.50") into a non-negative minor
 * BigInt (125050n) without float rounding. Throws on a non-positive /
 * malformed value so the form never records a zero/garbage movement.
 */
function toMinor(raw: string): bigint {
  const cleaned = String(raw).replace(/[, ]/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error("Enter a positive amount with up to 2 decimals.");
  }
  const [whole, frac = ""] = cleaned.split(".");
  const padded = (frac + "00").slice(0, 2);
  const minor = BigInt(whole) * 100n + BigInt(padded);
  if (minor <= 0n) throw new Error("Amount must be greater than zero.");
  return minor;
}

export interface RecordAdjustmentInput {
  code: string;
  walletId: string;
  investorId: string;
  movementType:
    | "capital_contribution"
    | "capital_return"
    | "profit_distribution"
    | "reinvestment_out"
    | "reinvestment_in"
    | "withdrawal_request"
    | "withdrawal_executed"
    | "manual_adjustment"
    | "residual_inventory_realloc";
  affectsBalance:
    | "cash"
    | "economic"
    | "reinvestment"
    | "committed"
    | "pending_distribution"
    | "residual_inventory";
  /** Positive USD dollar amount as a string. */
  amount: string;
  /** "credit" adds to the bucket, "debit" subtracts. */
  direction: "credit" | "debit";
  reason: string;
}

export async function recordAdjustmentAction(
  input: RecordAdjustmentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const reason = input.reason.trim();
    if (!reason) return { ok: false, error: "A reason is required." };
    const magnitude = toMinor(input.amount);
    const amountMinor = input.direction === "debit" ? -magnitude : magnitude;
    await recordWalletMovement({
      walletId: input.walletId,
      investorId: input.investorId,
      movementType: input.movementType,
      amountMinor,
      affectsBalance: input.affectsBalance,
      reason,
    });
    revalidatePath(pathFor(input.code));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to record adjustment.",
    };
  }
}

export async function reverseMovementAction(input: {
  code: string;
  movementId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const reason = input.reason.trim();
    if (!reason) return { ok: false, error: "A reason is required." };
    await reverseWalletMovement({ movementId: input.movementId, reason });
    revalidatePath(pathFor(input.code));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reverse movement.",
    };
  }
}

export interface MoveCapitalInput {
  code: string;
  sourceWalletId: string;
  targetWalletId: string;
  investorId: string;
  sourceProjectId: string;
  targetProjectId: string;
  /** Positive USD dollar amount as a string. */
  amount: string;
  reason: string;
}

export async function moveCapitalAction(
  input: MoveCapitalInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const reason = input.reason.trim();
    if (!reason) return { ok: false, error: "A reason is required." };
    if (input.sourceWalletId === input.targetWalletId) {
      return { ok: false, error: "Source and target wallets must differ." };
    }
    const amountMinor = toMinor(input.amount);
    await recordCrossProjectMovement({
      sourceWalletId: input.sourceWalletId,
      targetWalletId: input.targetWalletId,
      investorId: input.investorId,
      amountMinor,
      sourceProjectId: input.sourceProjectId,
      targetProjectId: input.targetProjectId,
      reason,
    });
    revalidatePath(pathFor(input.code));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to move capital.",
    };
  }
}
