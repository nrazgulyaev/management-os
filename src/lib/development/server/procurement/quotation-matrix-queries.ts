import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  devOsPurchaseRequests,
  procurementQuotations,
} from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";

/**
 * Sprint MD-1 — Quotation-comparison matrix data loader.
 *
 * Builds the RfqMatrix payload for `/procurement/quotation-comparison`:
 *   rows = open PRs (each PR is one material line)
 *   columns = unique vendors that have quoted across those PRs
 *   cells = per-vendor TOTAL price (NULL when the vendor didn't quote)
 *
 * Per-row winner = the vendor with the cheapest quotation total
 * (RfqMatrix's `winnerStrategy="min"` highlights it). The footer
 * button "Award split" lets the operator commit one winner per PR
 * row in a single batched action.
 */

export interface QuotationMatrixData {
  lines: Array<{
    id: string;
    requestCode: string;
    materialName: string;
    quantity: string;
    unitOfMeasure: string;
    requiredByDate: string;
    selectedVendorId: string | null;
  }>;
  vendors: Array<{
    id: string;
    name: string;
    onTimeRate: string | null;
    qualityRating: string | null;
  }>;
  /** prId → { [vendorId]: totalMinor (string) } */
  cellsByPrAndVendor: Record<string, Record<string, string>>;
}

export async function loadQuotationMatrix(): Promise<QuotationMatrixData> {
  const db = getDb();
  if (!db) {
    return { lines: [], vendors: [], cellsByPrAndVendor: {} };
  }

  // Pull all quotations across open PRs. We treat any PR that has at
  // least one received/under_review quotation as a matrix row.
  const allQuotations = await db
    .select({
      id: procurementQuotations.id,
      purchaseRequestId: procurementQuotations.purchaseRequestId,
      vendorId: procurementQuotations.vendorId,
      totalAmountMinor: procurementQuotations.totalAmountMinor,
      status: procurementQuotations.status,
    })
    .from(procurementQuotations);

  if (allQuotations.length === 0) {
    return { lines: [], vendors: [], cellsByPrAndVendor: {} };
  }

  const prIds = Array.from(
    new Set(allQuotations.map((q) => q.purchaseRequestId)),
  );
  const vendorIds = Array.from(new Set(allQuotations.map((q) => q.vendorId)));

  const [prRows, vendorRows] = await Promise.all([
    db
      .select({
        id: devOsPurchaseRequests.id,
        requestCode: devOsPurchaseRequests.requestCode,
        materialName: devOsPurchaseRequests.materialName,
        quantity: devOsPurchaseRequests.quantity,
        unitOfMeasure: devOsPurchaseRequests.unitOfMeasure,
        requiredByDate: devOsPurchaseRequests.requiredByDate,
      })
      .from(devOsPurchaseRequests)
      .where(inArray(devOsPurchaseRequests.id, prIds)),
    db
      .select({
        id: vendors.id,
        legalName: vendors.legalName,
        onTimeDeliveryRate: vendors.onTimeDeliveryRate,
        qualityRating: vendors.qualityRating,
      })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds)),
  ]);

  // Resolve the selected vendor per PR (if any).
  const selectedVendorByPrId = new Map<string, string>();
  for (const q of allQuotations) {
    if (q.status === "selected") {
      selectedVendorByPrId.set(q.purchaseRequestId, q.vendorId);
    }
  }

  // Build cells: { prId: { vendorId: totalMinor } }.
  // When a vendor has multiple quotations on the same PR (edge case),
  // keep the lowest total — it's the most-favourable cell value.
  const cellsByPrAndVendor: Record<string, Record<string, string>> = {};
  for (const q of allQuotations) {
    const row = cellsByPrAndVendor[q.purchaseRequestId] ?? {};
    const existing = row[q.vendorId];
    const incoming = BigInt(q.totalAmountMinor);
    if (existing === undefined || incoming < BigInt(existing)) {
      row[q.vendorId] = String(incoming);
    }
    cellsByPrAndVendor[q.purchaseRequestId] = row;
  }

  return {
    lines: prRows.map((p) => ({
      id: p.id,
      requestCode: p.requestCode,
      materialName: p.materialName,
      quantity: p.quantity,
      unitOfMeasure: p.unitOfMeasure,
      requiredByDate: p.requiredByDate,
      selectedVendorId: selectedVendorByPrId.get(p.id) ?? null,
    })),
    vendors: vendorRows.map((v) => ({
      id: v.id,
      name: v.legalName,
      onTimeRate: v.onTimeDeliveryRate,
      qualityRating: v.qualityRating,
    })),
    cellsByPrAndVendor,
  };
}
