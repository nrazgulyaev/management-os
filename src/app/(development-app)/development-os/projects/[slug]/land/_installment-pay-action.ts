"use server";

/**
 * UI action wrapper for markLandInstallmentPaid (which lives in a
 * server-only, non-"use server" module). The action existed and was
 * cron-reachable but had zero UI callers — the land payment schedule showed
 * installment status read-only with no way to record a payment. This wires
 * a manual "record payment" (full or partial). Real PSP capture is a
 * separate follow-up; this is the manual-mark-paid path.
 */

import { revalidatePath } from "next/cache";
import { markLandInstallmentPaid } from "@/lib/development/server/land/land-actions";

export async function recordLandInstallmentPaymentAction(input: {
  installmentId: string;
  slug: string;
  paidDate: string;
  /** MINOR units, as a string (bigint is awkward over the wire). */
  paidAmountMinor: string;
  paymentMethod?: string;
}): Promise<{ ok: boolean; status?: "paid" | "partial"; error?: string }> {
  try {
    const res = await markLandInstallmentPaid({
      installmentId: input.installmentId,
      paidDate: input.paidDate,
      paidAmountMinor: input.paidAmountMinor,
      paymentMethod: input.paymentMethod?.trim() || undefined,
    });
    revalidatePath(`/development-os/projects/${input.slug}/land`);
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record payment." };
  }
}
