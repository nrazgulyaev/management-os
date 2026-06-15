"use server";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { boqDocuments, boqSections } from "@/lib/db/schema/boq";
import { devCostCategories } from "@/lib/db/schema/dev-finance";
import { addBoqItem } from "./boq-actions";

/**
 * Sprint MD-1 — Bulk insert for `/development-os/boq/quick-entry`.
 *
 * Mirrors the Sprint-4 bookkeeper recipe (`bulkRecordTransactions`):
 * each row validated independently against `bulkRowSchema`, invalid
 * rows return a per-row error string, valid rows persist via the
 * existing atomic `addBoqItem` (which already recomputes section +
 * document subtotals after every insert).
 *
 * Catalogues pre-loaded once per call so the row loop never hits DB
 * for category-name resolution:
 *   - cost-category resolved by case-insensitive displayName
 *     OR categoryCode → categoryId
 *   - section resolved by case-insensitive section_code within the
 *     target BoQ document → sectionId
 *
 * `boqDocumentId` is passed once at action level (not per row) — every
 * row in a single quick-entry session targets the same BoQ document,
 * mirroring the "all rows → one bank account" pattern from Sprint 4.
 */

const bulkRowSchema = z.object({
  /**
   * Section code within the target BoQ document. Case-insensitive
   * resolution; unknown values surface as `section_not_found` per-row
   * rather than silently dropping into an "Imports" bucket.
   */
  sectionCode: z.string().min(1),
  itemCode: z.string().min(1),
  description: z.string().min(1),
  quantity: z.union([z.number(), z.string()]),
  unitOfMeasure: z.string().min(1),
  /**
   * Unit rate in major units (e.g. 12.50). Converted to minor units
   * (cents) inside the action via the document's currency.
   */
  unitRateMajor: z.union([z.number(), z.string()]),
  /** Free-text cost category name. Optional — null is allowed. */
  categoryName: z.string().optional().nullable(),
  /** Free-text vendor / supplier hint. Stored in `notes` for now. */
  supplierHint: z.string().optional().nullable(),
});

export type BulkBoqLineRow = z.input<typeof bulkRowSchema>;

const bulkInputSchema = z.object({
  boqDocumentId: z.string().uuid(),
  lines: z.array(bulkRowSchema).max(500),
});

export interface BulkBoqRowResult {
  rowIndex: number;
  ok: boolean;
  boqItemId?: string;
  itemCode?: string;
  error?: string;
}

export interface BulkBoqResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: BulkBoqRowResult[];
}

export async function bulkInsertBoqLines(
  input: z.input<typeof bulkInputSchema>,
): Promise<BulkBoqResult> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = bulkInputSchema.parse(input);
  const db = requireDb();

  // Pre-load BoQ document to fail fast + read its rate currency.
  const [doc] = await db
    .select()
    .from(boqDocuments)
    .where(
      and(
        eq(boqDocuments.id, parsed.boqDocumentId),
        eq(boqDocuments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!doc) {
    return {
      totalRows: parsed.lines.length,
      successCount: 0,
      errorCount: parsed.lines.length,
      results: parsed.lines.map((_, i) => ({
        rowIndex: i,
        ok: false,
        error: "boq_document_not_found",
      })),
    };
  }

  // Pre-load this document's sections by case-insensitive code.
  const sections = await db
    .select({
      id: boqSections.id,
      sectionCode: boqSections.sectionCode,
      sectionName: boqSections.sectionName,
    })
    .from(boqSections)
    .where(
      and(
        eq(boqSections.boqDocumentId, parsed.boqDocumentId),
        eq(boqSections.organizationId, organizationId),
      ),
    )
    .orderBy(asc(boqSections.displayOrder));
  const sectionByCode = new Map<string, string>();
  for (const s of sections) {
    sectionByCode.set(s.sectionCode.trim().toLowerCase(), s.id);
    sectionByCode.set(s.sectionName.trim().toLowerCase(), s.id);
  }

  // Pre-load cost categories.
  const categories = await db
    .select({
      id: devCostCategories.id,
      displayName: devCostCategories.displayName,
      categoryCode: devCostCategories.categoryCode,
    })
    .from(devCostCategories)
    .where(eq(devCostCategories.organizationId, organizationId));
  const categoryByName = new Map<string, string>();
  for (const c of categories) {
    categoryByName.set(c.displayName.trim().toLowerCase(), c.id);
    categoryByName.set(c.categoryCode.trim().toLowerCase(), c.id);
  }

  // USDT uses 6dp minor units; everything else uses 2dp (cents).
  const isUsdt = doc.currency.toUpperCase() === "USDT";
  const minorMultiplier = isUsdt ? 1_000_000 : 100;

  const results: BulkBoqRowResult[] = [];
  for (let i = 0; i < parsed.lines.length; i++) {
    const r = parsed.lines[i];
    try {
      const sectionKey = r.sectionCode.trim().toLowerCase();
      const sectionId = sectionByCode.get(sectionKey);
      if (!sectionId) {
        results.push({
          rowIndex: i,
          ok: false,
          error: `section_not_found: ${r.sectionCode}`,
        });
        continue;
      }
      let categoryId: string | null = null;
      if (r.categoryName) {
        const key = r.categoryName.trim().toLowerCase();
        categoryId = categoryByName.get(key) ?? null;
        if (!categoryId) {
          results.push({
            rowIndex: i,
            ok: false,
            error: `category_not_found: ${r.categoryName}`,
          });
          continue;
        }
      }
      const qtyNumber = Number(r.quantity);
      if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
        results.push({
          rowIndex: i,
          ok: false,
          error: "quantity_invalid",
        });
        continue;
      }
      const rateMajor = Number(r.unitRateMajor);
      if (!Number.isFinite(rateMajor) || rateMajor < 0) {
        results.push({
          rowIndex: i,
          ok: false,
          error: "unit_rate_invalid",
        });
        continue;
      }
      const unitRateMinor = BigInt(Math.round(rateMajor * minorMultiplier));

      const notes = r.supplierHint
        ? `supplier: ${r.supplierHint.trim()}`
        : null;

      const item = await addBoqItem({
        sectionId,
        itemCode: r.itemCode.trim(),
        description: r.description.trim(),
        quantity: qtyNumber,
        unitOfMeasure: r.unitOfMeasure.trim(),
        unitRateMinor,
        rateCurrency: doc.currency,
        costCategoryId: categoryId,
        notes,
      });
      results.push({
        rowIndex: i,
        ok: true,
        boqItemId: item.id,
        itemCode: item.itemCode,
      });
    } catch (err) {
      results.push({
        rowIndex: i,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return {
    totalRows: parsed.lines.length,
    successCount,
    errorCount: results.length - successCount,
    results,
  };
}
