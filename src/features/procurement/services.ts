import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequestLines,
  purchaseRequests,
  suppliers,
} from "@/lib/db/schema/inventory";
import { appUsers } from "@/lib/db/schema/identity";
import { projects } from "@/lib/db/schema/projects";
import type { WithSource } from "@/features/types";

export interface PurchaseRequestRow {
  id: string;
  requestCode: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  projectName: string | null;
  supplierName: string | null;
  requestedByName: string | null;
  requiredBy: string | null;
  totalEstimatedMinor: bigint | null;
  currency: string | null;
  createdAt: string;
  lineCount: number;
}

export interface PurchaseRequestLineRow {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedUnitCostMinor: bigint | null;
  currency: string | null;
  itemId: string | null;
  notes: string | null;
}

export interface PurchaseOrderRow {
  id: string;
  poCode: string;
  status: string;
  supplierName: string | null;
  projectName: string | null;
  totalMinor: bigint | null;
  currency: string | null;
  expectedDelivery: string | null;
  receivedAt: string | null;
  createdAt: string;
  lineCount: number;
}

export interface PurchaseOrderLineRow {
  id: string;
  description: string;
  quantityOrdered: number;
  quantityReceived: number;
  unit: string;
  unitCostMinor: bigint | null;
  currency: string | null;
  itemId: string | null;
}

const toNum = (v: string | number | null | undefined, f = 0) =>
  v === null || v === undefined ? f : typeof v === "number" ? v : parseFloat(v);

// -----------------------------------------------------------------------------
// Purchase requests
// -----------------------------------------------------------------------------

export async function listPurchaseRequests(opts?: {
  status?: string;
}): Promise<WithSource<PurchaseRequestRow>[]> {
  const db = getDb();
  if (!db) return [];
  const where = opts?.status ? eq(purchaseRequests.status, opts.status) : undefined;

  const rows = await db
    .select({
      r: purchaseRequests,
      supplierName: suppliers.name,
      projectName: projects.name,
      requestedByName: appUsers.fullName,
      lineCount: sql<number>`(SELECT count(*) FROM purchase_request_lines pl WHERE pl.request_id = ${purchaseRequests.id})`,
    })
    .from(purchaseRequests)
    .leftJoin(suppliers, eq(suppliers.id, purchaseRequests.supplierId))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .leftJoin(appUsers, eq(appUsers.id, purchaseRequests.requestedBy))
    .where(where)
    .orderBy(desc(purchaseRequests.createdAt))
    .limit(200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.r.id,
    requestCode: r.r.requestCode,
    title: r.r.title,
    description: r.r.description,
    priority: r.r.priority,
    status: r.r.status,
    projectName: r.projectName,
    supplierName: r.supplierName,
    requestedByName: r.requestedByName,
    requiredBy: r.r.requiredBy,
    totalEstimatedMinor: r.r.totalEstimatedMinor,
    currency: r.r.currency,
    createdAt: r.r.createdAt.toISOString(),
    lineCount: Number(r.lineCount ?? 0),
  }));
}

export interface PurchaseRequestDetail {
  id: string;
  requestCode: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  supplierId: string | null;
  supplierName: string | null;
  projectName: string | null;
  villaCode: string | null;
  requestedByName: string | null;
  totalEstimatedMinor: bigint | null;
  currency: string | null;
  requiredBy: string | null;
  createdAt: string;
  lines: PurchaseRequestLineRow[];
}

export async function getPurchaseRequestById(id: string): Promise<PurchaseRequestDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select({
      r: purchaseRequests,
      supplierName: suppliers.name,
      projectName: projects.name,
      requestedByName: appUsers.fullName,
    })
    .from(purchaseRequests)
    .leftJoin(suppliers, eq(suppliers.id, purchaseRequests.supplierId))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .leftJoin(appUsers, eq(appUsers.id, purchaseRequests.requestedBy))
    .where(eq(purchaseRequests.id, id))
    .limit(1);
  if (!r) return null;

  const lines = await db
    .select()
    .from(purchaseRequestLines)
    .where(eq(purchaseRequestLines.requestId, id))
    .orderBy(asc(purchaseRequestLines.createdAt));

  return {
    id: r.r.id,
    requestCode: r.r.requestCode,
    title: r.r.title,
    description: r.r.description,
    status: r.r.status,
    priority: r.r.priority,
    supplierId: r.r.supplierId,
    supplierName: r.supplierName,
    projectName: r.projectName,
    villaCode: null,
    requestedByName: r.requestedByName,
    totalEstimatedMinor: r.r.totalEstimatedMinor,
    currency: r.r.currency,
    requiredBy: r.r.requiredBy,
    createdAt: r.r.createdAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: toNum(l.quantity),
      unit: l.unit,
      estimatedUnitCostMinor: l.estimatedUnitCostMinor,
      currency: l.currency,
      itemId: l.itemId,
      notes: l.notes,
    })),
  };
}

// -----------------------------------------------------------------------------
// Purchase orders
// -----------------------------------------------------------------------------

export async function listPurchaseOrders(): Promise<WithSource<PurchaseOrderRow>[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      p: purchaseOrders,
      supplierName: suppliers.name,
      projectName: projects.name,
      lineCount: sql<number>`(SELECT count(*) FROM purchase_order_lines pl WHERE pl.purchase_order_id = ${purchaseOrders.id})`,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.p.id,
    poCode: r.p.poCode,
    status: r.p.status,
    supplierName: r.supplierName,
    projectName: r.projectName,
    totalMinor: r.p.totalMinor,
    currency: r.p.currency,
    expectedDelivery: r.p.expectedDelivery,
    receivedAt: r.p.receivedAt?.toISOString() ?? null,
    createdAt: r.p.createdAt.toISOString(),
    lineCount: Number(r.lineCount ?? 0),
  }));
}

export interface PurchaseOrderDetail {
  id: string;
  poCode: string;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
  projectName: string | null;
  expectedDelivery: string | null;
  receivedAt: string | null;
  totalMinor: bigint | null;
  currency: string | null;
  notes: string | null;
  createdAt: string;
  lines: PurchaseOrderLineRow[];
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [p] = await db
    .select({
      p: purchaseOrders,
      supplierName: suppliers.name,
      projectName: projects.name,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .where(eq(purchaseOrders.id, id))
    .limit(1);
  if (!p) return null;

  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderLines.createdAt));

  return {
    id: p.p.id,
    poCode: p.p.poCode,
    status: p.p.status,
    supplierId: p.p.supplierId,
    supplierName: p.supplierName,
    projectName: p.projectName,
    expectedDelivery: p.p.expectedDelivery,
    receivedAt: p.p.receivedAt?.toISOString() ?? null,
    totalMinor: p.p.totalMinor,
    currency: p.p.currency,
    notes: p.p.notes,
    createdAt: p.p.createdAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantityOrdered: toNum(l.quantityOrdered),
      quantityReceived: toNum(l.quantityReceived),
      unit: l.unit,
      unitCostMinor: l.unitCostMinor,
      currency: l.currency,
      itemId: l.itemId,
    })),
  };
}

// -----------------------------------------------------------------------------
// Daily counters
// -----------------------------------------------------------------------------

export async function nextProcurementCounter(prefix: "PR" | "PO"): Promise<number> {
  const db = getDb();
  if (!db) return 1;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pattern = `${prefix}-${today}-%`;
  if (prefix === "PR") {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseRequests)
      .where(sql`${purchaseRequests.requestCode} like ${pattern}`);
    return Number(r?.count ?? 0) + 1;
  }
  const [r] = await db
    .select({ count: sql<number>`count(*)` })
    .from(purchaseOrders)
    .where(sql`${purchaseOrders.poCode} like ${pattern}`);
  return Number(r?.count ?? 0) + 1;
}
