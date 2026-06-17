"use server";

/**
 * Bank-account detail form surface — `"use server"` adapters for the
 * client `_account-controls.tsx` island.
 *
 * The underlying `updateBankAccountThreshold` / `recordBankBalance` already
 * org-scope every read/write (HF-5: organization_id on the WHERE) and live
 * in the `"use server"` `bank-account-actions.ts`. These thin wrappers add
 * a FormData boundary, MAJOR→minor conversion, an ok/error envelope, and
 * path revalidation so the detail page refreshes after a write.
 *
 * Money is entered in MAJOR units of the account's currency and converted
 * to BIGINT minor units here (USDT = 6 decimals, everything else = 2).
 * Tenancy is enforced inside the underlying actions — no client-supplied
 * organizationId is ever passed.
 */

import { revalidatePath } from "next/cache";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  recordBankBalance,
  updateBankAccountThreshold,
} from "@/lib/development/server/bank-account-actions";

export type BankAccountResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): BankAccountResult => ({ ok: false, error });

function minorFromMajor(amountMajor: number, currency: string): bigint {
  const divisor = currency === "USDT" ? 1_000_000 : 100;
  return BigInt(Math.round(amountMajor * divisor));
}

export async function updateThresholdAction(
  formData: FormData,
): Promise<BankAccountResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "").trim();
    const currency = String(formData.get("currency") ?? "USD");
    const raw = String(formData.get("thresholdMajor") ?? "").trim();
    if (!id) return fail("Missing account id.");

    // Empty input clears the threshold (null).
    let thresholdMinor: bigint | null = null;
    if (raw.length > 0) {
      const major = Number(raw);
      if (!Number.isFinite(major) || major < 0) {
        return fail("Threshold must be a non-negative number.");
      }
      thresholdMinor = minorFromMajor(major, currency);
    }

    await updateBankAccountThreshold(id, thresholdMinor);
    revalidatePath(`/development-os/finance/bank-accounts/${id}`);
    revalidatePath("/development-os/finance/bank-accounts");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not update threshold.");
  }
}

export async function recordBalanceAction(
  formData: FormData,
): Promise<BankAccountResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "").trim();
    const currency = String(formData.get("currency") ?? "USD");
    const balanceRaw = String(formData.get("balanceMajor") ?? "").trim();
    const asOfDate = String(formData.get("asOfDate") ?? "").trim();
    const fxRate = String(formData.get("fxRate") ?? "").trim();
    if (!id) return fail("Missing account id.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return fail("As-of date must be a valid date.");
    }
    if (!/^\d+(\.\d+)?$/.test(fxRate) || Number(fxRate) <= 0) {
      return fail("FX rate must be a positive number.");
    }
    const balanceMajor = Number(balanceRaw);
    if (!Number.isFinite(balanceMajor) || balanceMajor < 0) {
      return fail("Balance must be a non-negative number.");
    }

    await recordBankBalance({
      id,
      newBalanceMinor: minorFromMajor(balanceMajor, currency),
      asOfDate,
      fxRate,
    });
    revalidatePath(`/development-os/finance/bank-accounts/${id}`);
    revalidatePath("/development-os/finance/bank-accounts");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not record balance.");
  }
}
