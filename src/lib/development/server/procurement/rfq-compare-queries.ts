import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  devOsPurchaseRequests,
  procurementQuotations,
  procurementQuotationLines,
} from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";
import { vendorScores } from "@/lib/db/schema/vendor-scores";

/**
 * RFQ quote-comparison read model.
 *
 * An "RFQ" is a `dev_os_purchase_requests` row; its quotes are
 * `procurement_quotations` (+ `procurement_quotation_lines`). This
 * builds the side-by-side comparison the QuoteCompare component renders,
 * plus a vendor-matcher-style recommendation derived from price + the
 * latest vendor composite score.
 *
 * Money stays bigint minor units throughout (no float math). The
 * comparison surfaces the quote total at face value in its quoted
 * currency — consistent with how selectQuotation creates the PO.
 *
 * Org-scoped: every read filters on the caller's organizationId, so a
 * foreign RFQ id resolves to null (the page 404s).
 */

export interface RfqQuoteLine {
  code: string;
  description: string;
  /** Major-unit display total for the line. */
  total: number;
}

export interface RfqQuoteColumn {
  quotationId: string;
  vendorId: string;
  vendorName: string;
  vendorScore?: number;
  totalMinor: bigint;
  currency: string;
  leadTimeDays: number;
  warrantyMonths: number;
  status: string;
  lines: RfqQuoteLine[];
  isWinner: boolean;
  savingsLabel?: string;
}

export interface RfqRecommendation {
  winnerQuotationId: string;
  winnerVendorId: string;
  winnerVendorName: string;
  winnerTotalMinor: bigint;
  currency: string;
  rationale: string;
  confidence: number;
}

export interface RfqCompareModel {
  requestId: string;
  requestCode: string;
  materialName: string;
  status: string;
  columns: RfqQuoteColumn[];
  recommendation: RfqRecommendation | null;
}

function daysBetween(from: string, toIso: string | null): number {
  if (!toIso) return 0;
  const a = new Date(from).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export async function getRfqCompareModel(
  requestId: string,
): Promise<RfqCompareModel | null> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return null;

  const [pr] = await db
    .select({
      id: devOsPurchaseRequests.id,
      requestCode: devOsPurchaseRequests.requestCode,
      materialName: devOsPurchaseRequests.materialName,
      status: devOsPurchaseRequests.status,
    })
    .from(devOsPurchaseRequests)
    .where(
      and(
        eq(devOsPurchaseRequests.id, requestId),
        eq(devOsPurchaseRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!pr) return null;

  const quoteRows = await db
    .select({
      id: procurementQuotations.id,
      vendorId: procurementQuotations.vendorId,
      vendorName: vendors.legalName,
      totalAmountMinor: procurementQuotations.totalAmountMinor,
      currency: procurementQuotations.currency,
      quotedAt: procurementQuotations.quotedAt,
      deliveryEstimatedDate: procurementQuotations.deliveryEstimatedDate,
      validityUntil: procurementQuotations.validityUntil,
      status: procurementQuotations.status,
    })
    .from(procurementQuotations)
    .leftJoin(vendors, eq(vendors.id, procurementQuotations.vendorId))
    .where(
      and(
        eq(procurementQuotations.purchaseRequestId, requestId),
        eq(procurementQuotations.organizationId, organizationId),
      ),
    )
    .orderBy(asc(procurementQuotations.totalAmountMinor));

  if (quoteRows.length === 0) {
    return {
      requestId: pr.id,
      requestCode: pr.requestCode,
      materialName: pr.materialName,
      status: pr.status,
      columns: [],
      recommendation: null,
    };
  }

  const quotationIds = quoteRows.map((q) => q.id);
  const vendorIds = [...new Set(quoteRows.map((q) => q.vendorId))];

  // Lines per quotation.
  const lineRows = await db
    .select()
    .from(procurementQuotationLines)
    .where(
      and(
        inArray(procurementQuotationLines.quotationId, quotationIds),
        eq(procurementQuotationLines.organizationId, organizationId),
      ),
    )
    .orderBy(asc(procurementQuotationLines.lineNumber));
  const linesByQuotation = new Map<string, RfqQuoteLine[]>();
  for (const l of lineRows) {
    const arr = linesByQuotation.get(l.quotationId) ?? [];
    const totalMinor = l.lineTotalMinor
      ? BigInt(l.lineTotalMinor)
      : BigInt(l.unitPriceMinor) * BigInt(Math.round(Number(l.quantity)));
    arr.push({
      code: `L${l.lineNumber}`,
      description: l.description,
      total: Number(totalMinor) / 100,
    });
    linesByQuotation.set(l.quotationId, arr);
  }

  // Latest composite score per vendor (history table — one row per recompute).
  const scoreByVendor = new Map<string, number>();
  if (vendorIds.length > 0) {
    const scoreRows = await db
      .select({
        vendorId: vendorScores.vendorId,
        composite: vendorScores.composite,
        computedAt: vendorScores.computedAt,
      })
      .from(vendorScores)
      .where(
        and(
          inArray(vendorScores.vendorId, vendorIds),
          eq(vendorScores.organizationId, organizationId),
        ),
      )
      .orderBy(desc(vendorScores.computedAt));
    for (const s of scoreRows) {
      if (!scoreByVendor.has(s.vendorId)) {
        scoreByVendor.set(s.vendorId, s.composite);
      }
    }
  }

  // Recommendation: rank by lowest price, break ties / boost by composite
  // score. The cheapest quote wins unless a slightly pricier vendor has a
  // materially higher score — mirrors the vendor-matcher heuristic.
  const lowest = quoteRows[0];
  let winner = lowest;
  for (const q of quoteRows) {
    const wScore = scoreByVendor.get(winner.vendorId) ?? 0;
    const qScore = scoreByVendor.get(q.vendorId) ?? 0;
    // Only consider an upgrade among quotes within 5% of the lowest price.
    const within5pct =
      BigInt(q.totalAmountMinor) <=
      (BigInt(lowest.totalAmountMinor) * 105n) / 100n;
    if (within5pct && qScore > wScore + 5) {
      winner = q;
    }
  }

  const runnerUp = quoteRows.find((q) => q.id !== winner.id);
  const savingsMinor = runnerUp
    ? BigInt(runnerUp.totalAmountMinor) - BigInt(winner.totalAmountMinor)
    : 0n;

  const columns: RfqQuoteColumn[] = quoteRows.map((q) => {
    const leadTimeDays = daysBetween(
      String(q.quotedAt),
      q.deliveryEstimatedDate ? String(q.deliveryEstimatedDate) : null,
    );
    const isWinner = q.id === winner.id;
    return {
      quotationId: q.id,
      vendorId: q.vendorId,
      vendorName: q.vendorName ?? "Vendor",
      vendorScore: scoreByVendor.get(q.vendorId),
      totalMinor: BigInt(q.totalAmountMinor),
      currency: q.currency,
      leadTimeDays,
      warrantyMonths: 0,
      status: q.status,
      lines: linesByQuotation.get(q.id) ?? [],
      isWinner,
      savingsLabel:
        isWinner && savingsMinor > 0n
          ? `Saves ${q.currency} ${(Number(savingsMinor) / 100).toLocaleString()} vs runner-up`
          : undefined,
    };
  });

  const winnerScore = scoreByVendor.get(winner.vendorId);
  const rationaleParts: string[] = [];
  if (winner.id === lowest.id) {
    rationaleParts.push("Lowest quoted price");
  } else {
    rationaleParts.push(
      "Best price-to-reliability trade-off (within 5% of the cheapest quote)",
    );
  }
  if (winnerScore != null) {
    rationaleParts.push(`vendor composite score ${winnerScore}/100`);
  }
  if (savingsMinor > 0n) {
    rationaleParts.push(
      `${winner.currency} ${(Number(savingsMinor) / 100).toLocaleString()} below the runner-up`,
    );
  }

  const confidence = winnerScore != null ? Math.min(95, 60 + winnerScore / 3) : 70;

  const recommendation: RfqRecommendation = {
    winnerQuotationId: winner.id,
    winnerVendorId: winner.vendorId,
    winnerVendorName: winner.vendorName ?? "Vendor",
    winnerTotalMinor: BigInt(winner.totalAmountMinor),
    currency: winner.currency,
    rationale: rationaleParts.join(" · ") + ".",
    confidence: Math.round(confidence),
  };

  return {
    requestId: pr.id,
    requestCode: pr.requestCode,
    materialName: pr.materialName,
    status: pr.status,
    columns,
    recommendation,
  };
}
