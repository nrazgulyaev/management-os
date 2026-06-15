"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  devOsPurchaseRequests,
  procurementQuotations,
  procurementQuotationLines,
} from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";

/**
 * Sprint MD-1 — Bulk insert for
 * `/development-os/procurement/quotations/import`.
 *
 * Mirrors the Sprint-4 bookkeeper recipe. Each row carries
 * (vendorName, itemDescription, qty, unit, unitPriceMajor,
 * leadTimeDays, note). The action groups rows by vendor, creates or
 * reuses one `procurement_quotations` row per (PR, vendor), and
 * inserts each row as a `procurement_quotation_lines` entry under
 * the matching quotation.
 *
 * Vendor resolution: case-insensitive against `vendors.legalName`
 * (preferred) then `vendors.shortName` (fallback). Unknown vendor
 * names surface as `vendor_not_found` rather than silently dropping.
 *
 * `prId` is passed once at the action level (not per row) — every
 * row in a single import targets the same PR, mirroring the
 * Sprint-4 "all rows → one bank account" pattern.
 */

const bulkLineSchema = z.object({
  vendorName: z.string().min(1),
  itemDescription: z.string().min(1),
  quantity: z.union([z.number(), z.string()]),
  unitOfMeasure: z.string().min(1),
  unitPriceMajor: z.union([z.number(), z.string()]),
  leadTimeDays: z.union([z.number(), z.string()]).optional().nullable(),
  note: z.string().optional().nullable(),
});

export type BulkQuotationLine = z.input<typeof bulkLineSchema>;

const bulkInputSchema = z.object({
  prId: z.string().uuid(),
  /**
   * Currency shared across every row in the import. The Sprint-4
   * recipe likewise gates currency at the action level so per-row
   * fx-rate logic doesn't leak into the import wizard.
   */
  currency: z.string().length(3).default("IDR"),
  quotationLines: z.array(bulkLineSchema).max(500),
});

export interface BulkQuotationRowResult {
  rowIndex: number;
  ok: boolean;
  quotationId?: string;
  quotationLineId?: string;
  error?: string;
}

export interface BulkQuotationResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  /** Number of distinct quotation rows materialised. */
  quotationsCreatedCount: number;
  results: BulkQuotationRowResult[];
}

export async function bulkInsertQuotationLines(
  input: z.input<typeof bulkInputSchema>,
): Promise<BulkQuotationResult> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = bulkInputSchema.parse(input);
  const db = requireDb();

  // Pre-load PR + vendor catalogue.
  // SECURITY: scope the PR load to the caller org so a foreign PR id cannot get
  // quotations + lines (stamped with the caller's org) attached onto it.
  const [pr] = await db
    .select()
    .from(devOsPurchaseRequests)
    .where(
      and(
        eq(devOsPurchaseRequests.id, parsed.prId),
        eq(devOsPurchaseRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!pr) {
    return {
      totalRows: parsed.quotationLines.length,
      successCount: 0,
      errorCount: parsed.quotationLines.length,
      quotationsCreatedCount: 0,
      results: parsed.quotationLines.map((_, i) => ({
        rowIndex: i,
        ok: false,
        error: "purchase_request_not_found",
      })),
    };
  }

  const vendorRows = await db
    .select({
      id: vendors.id,
      legalName: vendors.legalName,
      vendorCode: vendors.vendorCode,
    })
    .from(vendors)
    // SECURITY: only resolve vendor names against the caller's own catalogue so
    // a SKU/name cannot bind to another org's vendor id.
    .where(eq(vendors.organizationId, organizationId));
  const vendorByName = new Map<string, string>();
  for (const v of vendorRows) {
    vendorByName.set(v.legalName.trim().toLowerCase(), v.id);
    vendorByName.set(v.vendorCode.trim().toLowerCase(), v.id);
  }

  // Currency multiplier (USDT = 6dp minor; everything else = 2dp cents).
  const minorMultiplier =
    parsed.currency.toUpperCase() === "USDT" ? 1_000_000 : 100;

  // Group rows by vendor.
  type Grouped = {
    vendorId: string;
    rows: Array<{ rowIndex: number; row: z.infer<typeof bulkLineSchema> }>;
  };
  const byVendor = new Map<string, Grouped>();
  const groupingResults: BulkQuotationRowResult[] = [];

  for (let i = 0; i < parsed.quotationLines.length; i++) {
    const r = parsed.quotationLines[i];
    const key = r.vendorName.trim().toLowerCase();
    const vendorId = vendorByName.get(key);
    if (!vendorId) {
      groupingResults.push({
        rowIndex: i,
        ok: false,
        error: `vendor_not_found: ${r.vendorName}`,
      });
      continue;
    }
    const qty = Number(r.quantity);
    const unitPrice = Number(r.unitPriceMajor);
    if (!Number.isFinite(qty) || qty <= 0) {
      groupingResults.push({
        rowIndex: i,
        ok: false,
        error: "quantity_invalid",
      });
      continue;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      groupingResults.push({
        rowIndex: i,
        ok: false,
        error: "unit_price_invalid",
      });
      continue;
    }
    const existing = byVendor.get(vendorId);
    if (existing) {
      existing.rows.push({ rowIndex: i, row: r });
    } else {
      byVendor.set(vendorId, {
        vendorId,
        rows: [{ rowIndex: i, row: r }],
      });
    }
  }

  // Insert one quotation per vendor, then its lines.
  let quotationsCreatedCount = 0;
  const insertResults: BulkQuotationRowResult[] = [];

  for (const group of byVendor.values()) {
    try {
      // Compute total for this vendor's rows.
      let totalMinorBig = 0n;
      for (const { row: r } of group.rows) {
        const qty = Number(r.quantity);
        const unitPrice = Number(r.unitPriceMajor);
        totalMinorBig += BigInt(
          Math.round(qty * unitPrice * minorMultiplier),
        );
      }

      // Check if a quotation already exists for this (PR, vendor) +
      // is editable. We append lines to it; otherwise create new.
      const [existingQ] = await db
        .select()
        .from(procurementQuotations)
        .where(
          and(
            eq(procurementQuotations.purchaseRequestId, parsed.prId),
            eq(procurementQuotations.vendorId, group.vendorId),
            eq(procurementQuotations.organizationId, organizationId),
          ),
        )
        .limit(1);

      let quotationId: string;
      if (existingQ) {
        quotationId = existingQ.id;
      } else {
        const [created] = await db
          .insert(procurementQuotations)
          .values({
            organizationId,
            purchaseRequestId: parsed.prId,
            vendorId: group.vendorId,
            totalAmountMinor: totalMinorBig,
            currency: parsed.currency,
          })
          .returning({ id: procurementQuotations.id });
        quotationId = created.id;
        quotationsCreatedCount += 1;
      }

      // Insert each line.
      let lineNumberStart = 1;
      if (existingQ) {
        // Find the highest existing line_number to avoid collisions.
        const existingLines = await db
          .select({ lineNumber: procurementQuotationLines.lineNumber })
          .from(procurementQuotationLines)
          .where(eq(procurementQuotationLines.quotationId, quotationId));
        lineNumberStart =
          existingLines.reduce((m, l) => Math.max(m, l.lineNumber), 0) + 1;
      }

      let nextLineNumber = lineNumberStart;
      for (const { rowIndex, row: r } of group.rows) {
        try {
          const qty = Number(r.quantity);
          const unitPrice = Number(r.unitPriceMajor);
          const [inserted] = await db
            .insert(procurementQuotationLines)
            .values({
              organizationId,
              quotationId,
              lineNumber: nextLineNumber,
              description: r.itemDescription.trim(),
              quantity: String(qty),
              unitOfMeasure: r.unitOfMeasure.trim(),
              unitPriceMinor: BigInt(
                Math.round(unitPrice * minorMultiplier),
              ),
              notes: r.note ? r.note.trim() : null,
            })
            .returning({ id: procurementQuotationLines.id });
          nextLineNumber += 1;
          insertResults.push({
            rowIndex,
            ok: true,
            quotationId,
            quotationLineId: inserted.id,
          });
        } catch (err) {
          insertResults.push({
            rowIndex,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const { rowIndex } of group.rows) {
        insertResults.push({
          rowIndex,
          ok: false,
          error: `quotation_insert_failed: ${message}`,
        });
      }
    }
  }

  // Reassemble in row-index order.
  const merged = [...groupingResults, ...insertResults].sort(
    (a, b) => a.rowIndex - b.rowIndex,
  );

  const successCount = merged.filter((r) => r.ok).length;
  return {
    totalRows: parsed.quotationLines.length,
    successCount,
    errorCount: merged.length - successCount,
    quotationsCreatedCount,
    results: merged,
  };
}
