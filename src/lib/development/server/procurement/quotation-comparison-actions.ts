"use server";

import { inArray } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  procurementQuotations,
} from "@/lib/db/schema/procurement";
import { selectQuotation } from "./procurement-actions";

/**
 * Sprint MD-1 — Server action for the
 * `/development-os/procurement/quotation-comparison` matrix's
 * "Award split" footer button.
 *
 * Input shape: `{ supplierChoicesByPrId: { [prId]: vendorId } }` —
 * the operator picks one winning vendor per PR row in the matrix.
 * This action loops the choices, looks up the matching
 * (PR, vendor) quotation, and calls the existing atomic
 * `selectQuotation` for each. `selectQuotation` itself enforces
 * single-winner-per-PR via a DB partial unique index and creates the
 * downstream `material_purchase_orders` row in the same transaction.
 *
 * Returns the created PO ids + per-PR error list. Rows that already
 * have a selected quotation are skipped with a `already_selected`
 * note rather than failing the whole batch.
 */

const inputSchema = z.object({
  /** Map of PR id → chosen vendor id. */
  supplierChoicesByPrId: z.record(z.string().uuid(), z.string().uuid()),
});

export interface AwardRowResult {
  prId: string;
  ok: boolean;
  poId?: string;
  poCode?: string;
  error?: string;
}

export interface AwardSplitResult {
  totalRows: number;
  successCount: number;
  skippedCount: number;
  errorCount: number;
  results: AwardRowResult[];
}

export async function createPoFromQuotationComparison(
  input: z.input<typeof inputSchema>,
): Promise<AwardSplitResult> {
  await requireInternalUser();
  const parsed = inputSchema.parse(input);
  const db = requireDb();

  const prIds = Object.keys(parsed.supplierChoicesByPrId);
  if (prIds.length === 0) {
    return {
      totalRows: 0,
      successCount: 0,
      skippedCount: 0,
      errorCount: 0,
      results: [],
    };
  }

  // Pre-load every quotation row for these PRs so we can match the
  // chosen (PR, vendor) → quotation_id without a per-row DB hit.
  const quotationRows = await db
    .select({
      id: procurementQuotations.id,
      purchaseRequestId: procurementQuotations.purchaseRequestId,
      vendorId: procurementQuotations.vendorId,
      status: procurementQuotations.status,
    })
    .from(procurementQuotations)
    .where(inArray(procurementQuotations.purchaseRequestId, prIds));

  const quotationByPrAndVendor = new Map<string, (typeof quotationRows)[number]>();
  for (const q of quotationRows) {
    quotationByPrAndVendor.set(`${q.purchaseRequestId}::${q.vendorId}`, q);
  }

  const results: AwardRowResult[] = [];
  let successCount = 0;
  let skippedCount = 0;

  for (const [prId, vendorId] of Object.entries(parsed.supplierChoicesByPrId)) {
    const quotation = quotationByPrAndVendor.get(`${prId}::${vendorId}`);
    if (!quotation) {
      results.push({
        prId,
        ok: false,
        error: `no_quotation_for_vendor: ${vendorId}`,
      });
      continue;
    }
    if (quotation.status === "selected") {
      results.push({
        prId,
        ok: true,
        error: "already_selected",
      });
      skippedCount += 1;
      continue;
    }
    try {
      const out = await selectQuotation({
        quotationId: quotation.id,
        selectionReason: "Awarded via quotation-comparison matrix",
      });
      results.push({
        prId,
        ok: true,
        poId: out.poId,
        poCode: out.poCode,
      });
      successCount += 1;
    } catch (err) {
      results.push({
        prId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const errorCount = results.filter(
    (r) => !r.ok && r.error !== "already_selected",
  ).length;
  return {
    totalRows: results.length,
    successCount,
    skippedCount,
    errorCount,
    results,
  };
}
