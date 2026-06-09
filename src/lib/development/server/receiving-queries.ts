import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { materialReceivingHolds } from "@/lib/db/schema/material-receiving-holds";
import {
  getMaterialPurchaseOrders,
  getMaterialPO,
  getMaterialUtilization,
  type MaterialPoDetail,
} from "@/lib/development/server/materials";
import {
  type ReceivingDecision,
  type ReceivingHoldStatus,
} from "@/lib/db/schema/material-receiving-holds";

/**
 * Warehouse receiving workbench read-side. Reuses the material PO /
 * deliveries data layer (getMaterialPurchaseOrders + getMaterialPO) and
 * layers the QC-hold records (migration 0133) on top. No new PO/delivery
 * tables — the at-dock queue is derived from open POs.
 */

const RECEIVING_OPEN_STATUSES = new Set([
  "ordered",
  "partially_delivered",
]);

export interface ReceivingQueueItem {
  poId: string;
  poCode: string;
  projectName: string | null;
  vendorLegalName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  status: string;
  lineCount: number;
  deliveryCount: number;
  /** outstanding = ordered − delivered (across all lines) */
  outstandingQty: number;
  totalQtyOrdered: number;
  totalQtyDelivered: number;
  /** number of currently-open QC holds against this PO */
  openHoldCount: number;
  /** negative = late (past expected delivery), positive = days out */
  daysToExpected: number | null;
}

/**
 * At-dock FIFO receiving queue: open POs awaiting receipt, oldest
 * expected-delivery first (FIFO), with POs missing an expected date
 * falling back to order date. Closed / cancelled / fully-delivered POs
 * are excluded.
 */
export async function getReceivingQueue(): Promise<ReceivingQueueItem[]> {
  const db = getDb();
  if (!db) return [];

  const pos = (await getMaterialPurchaseOrders()).filter((p) =>
    RECEIVING_OPEN_STATUSES.has(p.status),
  );
  if (pos.length === 0) return [];

  // Open-hold counts per PO, in one query.
  const holdRows = await db
    .select({
      poId: materialReceivingHolds.poId,
      status: materialReceivingHolds.status,
    })
    .from(materialReceivingHolds);
  const openHoldByPo = new Map<string, number>();
  for (const h of holdRows) {
    if (h.status === "open") {
      openHoldByPo.set(h.poId, (openHoldByPo.get(h.poId) ?? 0) + 1);
    }
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const items: ReceivingQueueItem[] = [];
  for (const p of pos) {
    const util = await getMaterialUtilization(p.id);
    const expected = p.expectedDeliveryDate
      ? new Date(p.expectedDeliveryDate)
      : null;
    const daysToExpected =
      expected !== null
        ? Math.round((expected.getTime() - today.getTime()) / 86_400_000)
        : null;
    items.push({
      poId: p.id,
      poCode: p.poCode,
      projectName: p.projectName,
      vendorLegalName: p.vendorLegalName,
      orderDate: p.orderDate,
      expectedDeliveryDate: p.expectedDeliveryDate,
      status: p.status,
      lineCount: p.lineCount,
      deliveryCount: p.deliveryCount,
      outstandingQty: util.outstandingQty,
      totalQtyOrdered: util.totalQtyOrdered,
      totalQtyDelivered: util.totalQtyDelivered,
      openHoldCount: openHoldByPo.get(p.id) ?? 0,
      daysToExpected,
    });
  }

  // FIFO: oldest expected delivery first; missing-date POs sort by order
  // date. Ties broken by poCode for stable ordering.
  items.sort((a, b) => {
    const aKey = a.expectedDeliveryDate ?? a.orderDate;
    const bKey = b.expectedDeliveryDate ?? b.orderDate;
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
    return a.poCode < b.poCode ? -1 : 1;
  });

  return items;
}

export interface ReceivingHoldRow {
  id: string;
  decision: ReceivingDecision;
  status: ReceivingHoldStatus;
  quantityAccepted: string;
  quantityHeld: string;
  reason: string;
  decidedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ReceivingPoDetail {
  po: MaterialPoDetail;
  outstandingQty: number;
  holds: ReceivingHoldRow[];
}

/**
 * PO-held QC-chain drill-in: the full PO (lines + deliveries, reused from
 * getMaterialPO) plus the receiving-hold decision log for that PO.
 */
export async function getReceivingPoDetail(
  idOrCode: string,
): Promise<ReceivingPoDetail | null> {
  const po = await getMaterialPO(idOrCode);
  if (!po) return null;

  const db = getDb();
  const util = await getMaterialUtilization(po.id);

  let holds: ReceivingHoldRow[] = [];
  if (db) {
    const rows = await db
      .select()
      .from(materialReceivingHolds)
      .where(eq(materialReceivingHolds.poId, po.id))
      .orderBy(desc(materialReceivingHolds.createdAt));
    holds = rows.map((h) => ({
      id: h.id,
      decision: h.decision as ReceivingDecision,
      status: h.status as ReceivingHoldStatus,
      quantityAccepted: String(h.quantityAccepted),
      quantityHeld: String(h.quantityHeld),
      reason: h.reason,
      decidedBy: h.decidedBy,
      resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  return { po, outstandingQty: util.outstandingQty, holds };
}
