import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devOsPurchaseRequests } from "@/lib/db/schema/procurement";
import { procurementQuotations } from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";

/**
 * Stage 10.M.5 — Quotation comparison list page query helpers.
 *
 * Surfaces every Dev-OS PR that has at least one quotation, with
 * comparison-readiness data so procurement managers can drill into a
 * specific RFQ without first opening each PR detail page.
 *
 * Read-only — selection / rejection happens on the existing per-PR
 * detail page at /procurement/quotation-comparison/[requestCode].
 */

export interface ComparisonListRow {
  requestId: string;
  requestCode: string;
  materialName: string;
  quantity: string;
  unitOfMeasure: string;
  requiredByDate: string;
  urgency: string;
  prStatus: string;
  quotationCount: number;
  selectedCount: number;
  rejectedCount: number;
  pendingCount: number;
  lowestTotalMinor: string | null;
  highestTotalMinor: string | null;
  currency: string | null;
  earliestDelivery: string | null;
  selectedVendorName: string | null;
}

export interface ComparisonListSummary {
  awaitingDecisionCount: number;
  decidedCount: number;
  totalQuotationsCount: number;
  totalRfqsCount: number;
}

export async function listQuotationComparisons(): Promise<
  ComparisonListRow[]
> {
  const db = getDb();
  if (!db) return [];

  // 1. Per-PR aggregates straight off procurement_quotations.
  const aggRows = await db
    .select({
      requestId: procurementQuotations.purchaseRequestId,
      total: sql<number>`count(*)::int`,
      selected: sql<number>`count(*) FILTER (WHERE ${procurementQuotations.status} = 'selected')::int`,
      rejected: sql<number>`count(*) FILTER (WHERE ${procurementQuotations.status} = 'rejected')::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${procurementQuotations.status} IN ('received', 'under_review'))::int`,
      lowest: sql<string | null>`MIN(${procurementQuotations.totalAmountMinor})::text`,
      highest: sql<string | null>`MAX(${procurementQuotations.totalAmountMinor})::text`,
      currency: sql<string | null>`MAX(${procurementQuotations.currency})`,
      earliestDelivery: sql<string | null>`MIN(${procurementQuotations.deliveryEstimatedDate})::text`,
    })
    .from(procurementQuotations)
    .groupBy(procurementQuotations.purchaseRequestId);

  if (aggRows.length === 0) return [];
  const requestIds = aggRows.map((r) => r.requestId);

  // 2. Pull the matching PRs.
  const prRows = await db
    .select({
      id: devOsPurchaseRequests.id,
      requestCode: devOsPurchaseRequests.requestCode,
      materialName: devOsPurchaseRequests.materialName,
      quantity: devOsPurchaseRequests.quantity,
      unitOfMeasure: devOsPurchaseRequests.unitOfMeasure,
      requiredByDate: devOsPurchaseRequests.requiredByDate,
      urgency: devOsPurchaseRequests.urgency,
      status: devOsPurchaseRequests.status,
    })
    .from(devOsPurchaseRequests)
    .where(inArray(devOsPurchaseRequests.id, requestIds));

  // 3. Selected vendor name per PR (if any).
  const selectedVendorRows = await db
    .select({
      requestId: procurementQuotations.purchaseRequestId,
      vendorName: vendors.legalName,
    })
    .from(procurementQuotations)
    .leftJoin(vendors, eq(vendors.id, procurementQuotations.vendorId))
    .where(
      and(
        inArray(procurementQuotations.purchaseRequestId, requestIds),
        eq(procurementQuotations.status, "selected"),
      ),
    );
  const selectedVendorByPr = new Map(
    selectedVendorRows.map((r) => [r.requestId, r.vendorName ?? null]),
  );

  const aggByPr = new Map(aggRows.map((r) => [r.requestId, r]));

  return prRows
    .map((pr) => {
      const agg = aggByPr.get(pr.id);
      if (!agg) return null;
      const row: ComparisonListRow = {
        requestId: pr.id,
        requestCode: pr.requestCode,
        materialName: pr.materialName,
        quantity: String(pr.quantity),
        unitOfMeasure: pr.unitOfMeasure,
        requiredByDate: String(pr.requiredByDate),
        urgency: pr.urgency,
        prStatus: pr.status,
        quotationCount: Number(agg.total) || 0,
        selectedCount: Number(agg.selected) || 0,
        rejectedCount: Number(agg.rejected) || 0,
        pendingCount: Number(agg.pending) || 0,
        lowestTotalMinor: agg.lowest ?? null,
        highestTotalMinor: agg.highest ?? null,
        currency: agg.currency ?? null,
        earliestDelivery: agg.earliestDelivery ?? null,
        selectedVendorName: selectedVendorByPr.get(pr.id) ?? null,
      };
      return row;
    })
    .filter((r): r is ComparisonListRow => r !== null)
    .sort((a, b) => a.requiredByDate.localeCompare(b.requiredByDate));
}

export function summarizeQuotationComparisons(
  rows: ComparisonListRow[],
): ComparisonListSummary {
  let awaiting = 0;
  let decided = 0;
  let totalQ = 0;
  for (const r of rows) {
    if (r.selectedCount > 0) decided += 1;
    else awaiting += 1;
    totalQ += r.quotationCount;
  }
  return {
    awaitingDecisionCount: awaiting,
    decidedCount: decided,
    totalQuotationsCount: totalQ,
    totalRfqsCount: rows.length,
  };
}

export async function listPurchaseRequestsAwaitingQuotations(): Promise<
  Array<{
    id: string;
    requestCode: string;
    materialName: string;
    requiredByDate: string;
    urgency: string;
    status: string;
  }>
> {
  const db = getDb();
  if (!db) return [];

  // PRs in 'submitted' or 'approved' status with NO quotations yet.
  const haveQuotes = await db
    .select({ requestId: procurementQuotations.purchaseRequestId })
    .from(procurementQuotations)
    .groupBy(procurementQuotations.purchaseRequestId);
  const haveQuotesIds = new Set(haveQuotes.map((r) => r.requestId));

  const candidates = await db
    .select({
      id: devOsPurchaseRequests.id,
      requestCode: devOsPurchaseRequests.requestCode,
      materialName: devOsPurchaseRequests.materialName,
      requiredByDate: devOsPurchaseRequests.requiredByDate,
      urgency: devOsPurchaseRequests.urgency,
      status: devOsPurchaseRequests.status,
    })
    .from(devOsPurchaseRequests)
    .where(inArray(devOsPurchaseRequests.status, ["submitted", "approved"]))
    .orderBy(desc(devOsPurchaseRequests.requiredByDate));

  return candidates
    .filter((c) => !haveQuotesIds.has(c.id))
    .map((c) => ({
      id: c.id,
      requestCode: c.requestCode,
      materialName: c.materialName,
      requiredByDate: String(c.requiredByDate),
      urgency: c.urgency,
      status: c.status,
    }));
}
