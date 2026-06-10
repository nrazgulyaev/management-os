"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import {
  materialPurchaseOrders,
  materialPoLines,
} from "@/lib/db/schema/site-operations";
import {
  devOsInventoryItems,
  devOsInventoryStockBalances,
  devOsInventoryMovements,
} from "@/lib/db/schema/dev-os-inventory";
import type { ReceivePoResult } from "./warehouse-inbound-types";

/**
 * Warehouse INBOUND receipt action (dev-warehouse mock §03).
 *
 * Receives a procurement PO line-by-line at the dock. For each line the
 * operator supplies a received-qty + a QC pass/fail verdict. The action,
 * in ONE transaction:
 *
 *   1. bumps `material_po_lines.quantity_delivered` (clamped to ordered),
 *   2. for QC-passed lines that map to a Dev OS inventory SKU, writes a
 *      `received` movement into `dev_os_inventory_movements` and credits
 *      `dev_os_inventory_stock_balances` at the chosen warehouse location
 *      (the same atomic balance update the movement form already uses),
 *   3. recomputes the PO status (partially_delivered / fully_delivered)
 *      and stamps `received_at` when the PO fully closes.
 *
 * Org-scoped on every read + write (`requireOrgId`), audit-logged. No
 * money moves here — payment lifecycle stays in po-money-actions
 * (manual mark-paid only, Indonesia rails deferred). Money columns the
 * movement carries are BIGINT minor units.
 */

const lineInputSchema = z.object({
  lineId: z.string().uuid(),
  receivedQty: z.number().min(0),
  qcStatus: z.enum(["pass", "fail"]),
});

const receivePoSchema = z.object({
  poId: z.string().uuid(),
  /** Warehouse location the passed goods land in. Required when any line
   * with a matched SKU is being received. */
  locationId: z.string().uuid().nullable().optional(),
  lines: z.array(lineInputSchema).min(1),
  note: z.string().trim().max(2000).optional().nullable(),
});

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export async function receivePurchaseOrder(
  input: z.input<typeof receivePoSchema>,
): Promise<ReceivePoResult> {
  const parsed = receivePoSchema.parse(input);
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  const actorId = ctx.appUser?.id ?? null;
  if (!actorId) {
    throw new Error("receivePurchaseOrder: requires an authenticated app user");
  }

  return db.transaction(async (tx) => {
    // 1) PO + org guard.
    const [po] = await tx
      .select({
        id: materialPurchaseOrders.id,
        poCode: materialPurchaseOrders.poCode,
        status: materialPurchaseOrders.status,
      })
      .from(materialPurchaseOrders)
      .where(
        and(
          eq(materialPurchaseOrders.id, parsed.poId),
          eq(materialPurchaseOrders.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!po) throw new Error("Purchase order not found");
    if (po.status === "cancelled") {
      throw new Error("Cannot receive a cancelled purchase order");
    }

    // 2) Load all lines for the PO (org-scoped) so we can validate the
    //    submitted line ids belong to it + compute the new aggregate status.
    const allLines = await tx
      .select({
        id: materialPoLines.id,
        materialName: materialPoLines.materialName,
        unitOfMeasure: materialPoLines.unitOfMeasure,
        quantityOrdered: materialPoLines.quantityOrdered,
        quantityDelivered: materialPoLines.quantityDelivered,
      })
      .from(materialPoLines)
      .where(
        and(
          eq(materialPoLines.poId, parsed.poId),
          eq(materialPoLines.organizationId, organizationId),
        ),
      );
    const lineById = new Map(allLines.map((l) => [l.id, l]));

    for (const inLine of parsed.lines) {
      if (!lineById.has(inLine.lineId)) {
        throw new Error(`Line ${inLine.lineId} does not belong to ${po.poCode}`);
      }
    }

    // 3) Resolve a single movement-code base once (INV-YYYY-####) to avoid
    //    a per-line COUNT round-trip; we increment locally inside the txn.
    const [{ count }] = await tx
      .select({ count: sql<string>`COUNT(*)::text` })
      .from(devOsInventoryMovements);
    const year = new Date().getFullYear();
    let seq = Number(count ?? "0");

    let movementsWritten = 0;
    let unmatchedPassed = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const inLine of parsed.lines) {
      const line = lineById.get(inLine.lineId)!;
      const ordered = Number(line.quantityOrdered);
      const alreadyDelivered = Number(line.quantityDelivered);
      const receivedQty = inLine.receivedQty;

      if (receivedQty <= 0) continue;

      // a) Bump delivered quantity (never exceed ordered).
      const newDelivered = Math.min(ordered, alreadyDelivered + receivedQty);
      // SECURITY (over-credit): the stock movement + balance credit must use
      // the CLAMPED delta actually applied to quantity_delivered, never the
      // raw receivedQty — otherwise a caller can over-receive a line past its
      // ordered qty and inflate on-hand stock. When the line was already full
      // (or this receipt overshoots), the credited delta collapses to <= the
      // remaining-to-deliver amount.
      const creditedQty = newDelivered - alreadyDelivered;
      await tx
        .update(materialPoLines)
        .set({ quantityDelivered: newDelivered.toFixed(4) })
        .where(
          and(
            eq(materialPoLines.id, line.id),
            eq(materialPoLines.organizationId, organizationId),
          ),
        );

      // b) Stock movement only for QC-passed lines with a matched SKU +
      //    a target warehouse location. Nothing to credit when the clamp
      //    already absorbed the whole receipt (line was full).
      if (inLine.qcStatus !== "pass") continue;
      if (creditedQty <= 0) continue;

      const [item] = await tx
        .select({
          id: devOsInventoryItems.id,
          averageCostMinor: devOsInventoryItems.averageCostMinor,
          defaultCurrency: devOsInventoryItems.defaultCurrency,
        })
        .from(devOsInventoryItems)
        .where(
          and(
            eq(devOsInventoryItems.organizationId, organizationId),
            sql`lower(${devOsInventoryItems.sku}) = lower(${line.materialName})`,
          ),
        )
        .limit(1);

      if (!item) {
        unmatchedPassed += 1;
        continue;
      }
      if (!parsed.locationId) {
        throw new Error(
          "A warehouse location is required to receive matched stock",
        );
      }

      seq += 1;
      const movementCode = `INV-${year}-${pad4(seq)}`;

      // Insert the immutable movement row (received → credit only).
      await tx.insert(devOsInventoryMovements).values({
        organizationId,
        movementCode,
        itemId: item.id,
        quantity: creditedQty.toFixed(4),
        movementType: "received",
        toLocationId: parsed.locationId,
        relatedPoId: parsed.poId,
        responsibleUserId: actorId,
        movementDate: today,
        reason: `Receipt · ${po.poCode}`,
        notes: parsed.note ?? null,
      });

      // Credit the balance (UPSERT on item × location).
      const [existing] = await tx
        .select({ id: devOsInventoryStockBalances.id })
        .from(devOsInventoryStockBalances)
        .where(
          and(
            eq(devOsInventoryStockBalances.itemId, item.id),
            eq(devOsInventoryStockBalances.locationId, parsed.locationId),
            eq(devOsInventoryStockBalances.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(devOsInventoryStockBalances)
          .set({
            quantityOnHand: sql`${devOsInventoryStockBalances.quantityOnHand} + ${creditedQty}`,
            lastMovementAt: new Date(),
          })
          .where(
            and(
              eq(devOsInventoryStockBalances.id, existing.id),
              eq(devOsInventoryStockBalances.organizationId, organizationId),
            ),
          );
      } else {
        await tx.insert(devOsInventoryStockBalances).values({
          organizationId,
          itemId: item.id,
          locationId: parsed.locationId,
          quantityOnHand: creditedQty.toFixed(4),
          quantityReserved: "0",
          lastMovementAt: new Date(),
        });
      }
      movementsWritten += 1;
    }

    // 4) Recompute the PO status from the (now updated) line totals.
    const refreshed = await tx
      .select({
        ordered: materialPoLines.quantityOrdered,
        delivered: materialPoLines.quantityDelivered,
      })
      .from(materialPoLines)
      .where(
        and(
          eq(materialPoLines.poId, parsed.poId),
          eq(materialPoLines.organizationId, organizationId),
        ),
      );
    const totalOrdered = refreshed.reduce((s, l) => s + Number(l.ordered), 0);
    const totalDelivered = refreshed.reduce(
      (s, l) => s + Number(l.delivered),
      0,
    );
    let nextStatus = po.status;
    let receivedAt: Date | null = null;
    if (totalDelivered <= 0) {
      nextStatus = po.status === "draft" ? "draft" : "ordered";
    } else if (totalDelivered >= totalOrdered) {
      nextStatus = "fully_delivered";
      receivedAt = new Date();
    } else {
      nextStatus = "partially_delivered";
    }

    if (nextStatus !== po.status || receivedAt) {
      await tx
        .update(materialPurchaseOrders)
        .set({
          status: nextStatus,
          ...(receivedAt ? { receivedAt } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(materialPurchaseOrders.id, parsed.poId),
            eq(materialPurchaseOrders.organizationId, organizationId),
          ),
        );
    }

    await recordAuditEvent({
      actorUserId: actorId,
      action: "warehouse.receive_po",
      entityType: "material_purchase_order",
      entityId: parsed.poId,
      before: { status: po.status },
      after: {
        organizationId,
        poCode: po.poCode,
        status: nextStatus,
        linesReceived: parsed.lines.filter((l) => l.receivedQty > 0).length,
        movementsWritten,
        unmatchedPassed,
        locationId: parsed.locationId ?? null,
      },
    });

    return {
      poId: parsed.poId,
      poCode: po.poCode,
      status: nextStatus,
      movementsWritten,
      unmatchedPassed,
    };
  });
}
