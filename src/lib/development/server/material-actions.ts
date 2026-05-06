import "server-only";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  materialPurchaseOrders,
  materialPoLines,
  materialDeliveries,
  materialDeliveryLines,
} from "@/lib/db/schema/site-operations";

/**
 * Material PO + delivery flow. Both `createMaterialPO` and
 * `recordMaterialDelivery` are atomic — parent + line items in a
 * single transaction. Deliveries also update `material_po_lines.quantity_delivered`
 * and recompute the PO's `status` (ordered → partially_delivered →
 * fully_delivered) inside the same tx.
 */

const lineSchema = z.object({
  lineNumber: z.number().int().min(1),
  materialName: z.string().min(1),
  materialCategory: z.string().optional().nullable(),
  unitOfMeasure: z.string().min(1),
  quantityOrdered: z.number().positive(),
  unitPriceUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  unitPriceOriginalMinor: z.union([z.bigint(), z.string(), z.number()]),
  notes: z.string().optional().nullable(),
});

const poCreateSchema = z.object({
  poCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  commitmentLedgerId: z.string().uuid().optional().nullable(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  totalAmountCurrency: z.enum(["USD", "IDR", "RUB", "EUR", "USDT", "CNY"]),
  fxRateAtOrder: z.string().regex(/^\d+(\.\d+)?$/),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint" ? v : BigInt(typeof v === "number" ? Math.trunc(v) : v);

export async function createMaterialPO(
  input: z.input<typeof poCreateSchema>,
): Promise<{ id: string; poCode: string; lineCount: number }> {
  const parsed = poCreateSchema.parse(input);
  const db = requireDb();
  const fx = Number(parsed.fxRateAtOrder);
  if (!(fx > 0)) throw new Error("fxRateAtOrder must be > 0");

  // Compute totals from lines (server-derived, never client-asserted).
  let totalUsdMinor = 0n;
  let totalOriginalMinor = 0n;
  for (const l of parsed.lines) {
    const unitUsd = toBig(l.unitPriceUsdMinor);
    const unitOrig = toBig(l.unitPriceOriginalMinor);
    totalUsdMinor += BigInt(Math.round(Number(unitUsd) * l.quantityOrdered));
    totalOriginalMinor += BigInt(
      Math.round(Number(unitOrig) * l.quantityOrdered),
    );
  }

  return await db.transaction(async (tx) => {
    const [po] = await tx
      .insert(materialPurchaseOrders)
      .values({
        poCode: parsed.poCode,
        projectId: parsed.projectId,
        vendorId: parsed.vendorId,
        commitmentLedgerId: parsed.commitmentLedgerId ?? null,
        orderDate: parsed.orderDate,
        expectedDeliveryDate: parsed.expectedDeliveryDate ?? null,
        totalAmountUsdMinor: totalUsdMinor,
        totalAmountCurrency: parsed.totalAmountCurrency,
        totalAmountOriginalMinor: totalOriginalMinor,
        fxRateAtOrder: parsed.fxRateAtOrder,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: materialPurchaseOrders.id,
        poCode: materialPurchaseOrders.poCode,
      });

    for (const l of parsed.lines) {
      await tx.insert(materialPoLines).values({
        poId: po.id,
        lineNumber: l.lineNumber,
        materialName: l.materialName,
        materialCategory: l.materialCategory ?? null,
        unitOfMeasure: l.unitOfMeasure,
        quantityOrdered: l.quantityOrdered.toFixed(4),
        unitPriceUsdMinor: toBig(l.unitPriceUsdMinor),
        unitPriceOriginalMinor: toBig(l.unitPriceOriginalMinor),
        notes: l.notes ?? null,
      });
    }

    return {
      id: po.id,
      poCode: po.poCode,
      lineCount: parsed.lines.length,
    };
  });
}

export async function cancelMaterialPO(
  id: string,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 3) {
    throw new Error("cancelMaterialPO: reason required (≥3 chars)");
  }
  const db = requireDb();
  await db
    .update(materialPurchaseOrders)
    .set({
      status: "cancelled",
      notes: reason,
      updatedAt: new Date(),
    })
    .where(eq(materialPurchaseOrders.id, id));
}

const deliveryLineSchema = z.object({
  poLineId: z.string().uuid(),
  quantityReceived: z.number().positive(),
  qualityCheckPassed: z.boolean().default(true),
  rejectionReason: z.string().optional().nullable(),
  storedInZoneId: z.string().uuid().optional().nullable(),
});

const deliveryCreateSchema = z.object({
  deliveryCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  poId: z.string().uuid(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receivedAt: z.string().optional().nullable(),
  relatedSiteReportId: z.string().uuid().optional().nullable(),
  qualityCheckStatus: z
    .enum(["pending", "accepted", "partial_acceptance", "rejected"])
    .default("pending"),
  qualityNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(deliveryLineSchema).min(1),
});

/**
 * Atomic: insert delivery + delivery_lines, then update each
 * referenced po_line.quantity_delivered, then recompute the PO's
 * status (ordered → partially_delivered → fully_delivered).
 */
export async function recordMaterialDelivery(
  input: z.input<typeof deliveryCreateSchema>,
): Promise<{
  id: string;
  deliveryCode: string;
  newPoStatus: string;
  linesUpdated: number;
}> {
  const parsed = deliveryCreateSchema.parse(input);
  const db = requireDb();

  return await db.transaction(async (tx) => {
    // Verify all PO lines belong to the PO.
    const poLineIds = parsed.lines.map((l) => l.poLineId);
    const validLines = await tx
      .select({
        id: materialPoLines.id,
        poId: materialPoLines.poId,
        quantityOrdered: materialPoLines.quantityOrdered,
        quantityDelivered: materialPoLines.quantityDelivered,
      })
      .from(materialPoLines)
      .where(
        sql`${materialPoLines.id} = ANY(${sql.raw(`ARRAY[${poLineIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`,
      );
    const lineById = new Map(validLines.map((l) => [l.id, l]));
    for (const l of parsed.lines) {
      const existing = lineById.get(l.poLineId);
      if (!existing) {
        throw new Error(`PO line ${l.poLineId} not found`);
      }
      if (existing.poId !== parsed.poId) {
        throw new Error(
          `PO line ${l.poLineId} does not belong to PO ${parsed.poId}`,
        );
      }
      const delivered = Number(existing.quantityDelivered);
      const ordered = Number(existing.quantityOrdered);
      if (delivered + l.quantityReceived > ordered) {
        throw new Error(
          `Line ${l.poLineId}: cannot deliver ${l.quantityReceived} (already ${delivered}/${ordered})`,
        );
      }
    }

    // Insert delivery parent
    const [d] = await tx
      .insert(materialDeliveries)
      .values({
        deliveryCode: parsed.deliveryCode,
        poId: parsed.poId,
        deliveryDate: parsed.deliveryDate,
        receivedAt: parsed.receivedAt ? new Date(parsed.receivedAt) : new Date(),
        relatedSiteReportId: parsed.relatedSiteReportId ?? null,
        qualityCheckStatus: parsed.qualityCheckStatus,
        qualityNotes: parsed.qualityNotes ?? null,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: materialDeliveries.id,
        deliveryCode: materialDeliveries.deliveryCode,
      });

    // Insert delivery lines + bump po_lines.quantity_delivered
    for (const l of parsed.lines) {
      await tx.insert(materialDeliveryLines).values({
        deliveryId: d.id,
        poLineId: l.poLineId,
        quantityReceived: l.quantityReceived.toFixed(4),
        qualityCheckPassed: l.qualityCheckPassed,
        rejectionReason: l.rejectionReason ?? null,
        storedInZoneId: l.storedInZoneId ?? null,
      });
      const existing = lineById.get(l.poLineId)!;
      const newDelivered = Number(existing.quantityDelivered) + l.quantityReceived;
      await tx
        .update(materialPoLines)
        .set({ quantityDelivered: newDelivered.toFixed(4) })
        .where(eq(materialPoLines.id, l.poLineId));
    }

    // Recompute PO status from aggregated line totals.
    const [aggRow] = await tx.execute(sql`
      SELECT
        coalesce(sum(quantity_ordered), 0)::numeric AS ordered,
        coalesce(sum(quantity_delivered), 0)::numeric AS delivered
      FROM material_po_lines
      WHERE po_id = ${parsed.poId}
    `);
    const agg = (aggRow ?? {}) as Record<string, unknown>;
    const ordered = Number(agg.ordered ?? 0);
    const delivered = Number(agg.delivered ?? 0);
    const newStatus =
      delivered <= 0
        ? "ordered"
        : delivered >= ordered
          ? "fully_delivered"
          : "partially_delivered";
    await tx
      .update(materialPurchaseOrders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(materialPurchaseOrders.id, parsed.poId));

    return {
      id: d.id,
      deliveryCode: d.deliveryCode,
      newPoStatus: newStatus,
      linesUpdated: parsed.lines.length,
    };
  });
}

const qualitySchema = z.object({
  deliveryId: z.string().uuid(),
  status: z.enum(["pending", "accepted", "partial_acceptance", "rejected"]),
  notes: z.string().optional().nullable(),
});

export async function markDeliveryQualityChecked(
  input: z.input<typeof qualitySchema>,
): Promise<void> {
  const parsed = qualitySchema.parse(input);
  const db = requireDb();
  await db
    .update(materialDeliveries)
    .set({
      qualityCheckStatus: parsed.status,
      qualityNotes: parsed.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(materialDeliveries.id, parsed.deliveryId));
}
