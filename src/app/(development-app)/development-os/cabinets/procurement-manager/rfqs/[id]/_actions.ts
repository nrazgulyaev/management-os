"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { selectQuotation } from "@/lib/development/server/procurement/procurement-actions";

/**
 * Award the winning quotation for an RFQ.
 *
 * Delegates to the existing org-scoped `selectQuotation`, which — in a
 * single transaction — marks the chosen quotation 'selected', rejects its
 * siblings, creates the downstream `material_purchase_orders` row, and
 * advances the purchase request to 'po_created'. selectQuotation derives
 * the org + actor server-side and scopes every write to the caller's org,
 * so a foreign quotationId cannot drive a PO into this org.
 */

const schema = z.object({
  quotationId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});

export async function awardRfqQuotation(
  input: z.input<typeof schema>,
): Promise<{ ok: true; poCode: string } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const result = await selectQuotation({
      quotationId: parsed.data.quotationId,
      selectionReason: parsed.data.reason ?? "Awarded from RFQ comparison",
    });
    revalidatePath("/development-os/cabinets/procurement-manager");
    revalidatePath("/development-os/cabinets/procurement-manager/pos");
    return { ok: true, poCode: result.poCode };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Award failed",
    };
  }
}
