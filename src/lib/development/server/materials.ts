import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  materialPurchaseOrders,
  materialPoLines,
  materialDeliveries,
} from "@/lib/db/schema/site-operations";
import type {
  MaterialPoStatus,
  MaterialQualityStatus,
} from "@/lib/development/constants/material-constants";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);
const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

export interface MaterialPoListItem {
  id: string;
  poCode: string;
  projectId: string;
  projectName: string | null;
  vendorId: string;
  vendorCode: string;
  vendorLegalName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  status: MaterialPoStatus;
  totalAmountUsdMinor: string;
  totalAmountCurrency: string;
  totalAmountOriginalMinor: string;
  lineCount: number;
  deliveryCount: number;
}

export interface MaterialPoFilters {
  projectId?: string;
  vendorId?: string;
  status?: MaterialPoStatus;
  fromDate?: string;
  toDate?: string;
}

export async function getMaterialPurchaseOrders(
  filters: MaterialPoFilters = {},
): Promise<MaterialPoListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const conditions: ReturnType<typeof sql>[] = [
    sql`po.organization_id = ${organizationId}`,
  ];
  if (filters.projectId)
    conditions.push(sql`po.project_id = ${filters.projectId}`);
  if (filters.vendorId)
    conditions.push(sql`po.vendor_id = ${filters.vendorId}`);
  if (filters.status) conditions.push(sql`po.status = ${filters.status}`);
  if (filters.fromDate)
    conditions.push(sql`po.order_date >= ${filters.fromDate}`);
  if (filters.toDate) conditions.push(sql`po.order_date <= ${filters.toDate}`);
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await db.execute(sql`
    SELECT
      po.id, po.po_code, po.project_id, p.name AS project_name,
      po.vendor_id, v.vendor_code, v.legal_name AS vendor_legal_name,
      po.order_date, po.expected_delivery_date, po.status,
      po.total_amount_usd_minor, po.total_amount_currency, po.total_amount_original_minor,
      coalesce(l.line_count, 0)::int AS line_count,
      coalesce(d.delivery_count, 0)::int AS delivery_count
    FROM material_purchase_orders po
    JOIN vendors v ON v.id = po.vendor_id
    LEFT JOIN projects p ON p.id = po.project_id
    LEFT JOIN (
      SELECT po_id, count(*)::int AS line_count
      FROM material_po_lines GROUP BY po_id
    ) l ON l.po_id = po.id
    LEFT JOIN (
      SELECT po_id, count(*)::int AS delivery_count
      FROM material_deliveries GROUP BY po_id
    ) d ON d.po_id = po.id
    ${where}
    ORDER BY po.order_date DESC, po.po_code DESC
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    poCode: String(r.po_code),
    projectId: String(r.project_id),
    projectName: r.project_name ? String(r.project_name) : null,
    vendorId: String(r.vendor_id),
    vendorCode: String(r.vendor_code),
    vendorLegalName: String(r.vendor_legal_name),
    orderDate: String(r.order_date),
    expectedDeliveryDate: r.expected_delivery_date
      ? String(r.expected_delivery_date)
      : null,
    status: String(r.status) as MaterialPoStatus,
    totalAmountUsdMinor: toStr(r.total_amount_usd_minor),
    totalAmountCurrency: String(r.total_amount_currency),
    totalAmountOriginalMinor: toStr(r.total_amount_original_minor),
    lineCount: toNum(r.line_count),
    deliveryCount: toNum(r.delivery_count),
  }));
}

export interface MaterialPoLineItem {
  id: string;
  lineNumber: number;
  materialName: string;
  materialCategory: string | null;
  unitOfMeasure: string;
  quantityOrdered: string;
  quantityDelivered: string;
  quantityConsumed: string;
  unitPriceUsdMinor: string;
  lineTotalUsdMinor: string | null;
}

export interface MaterialPoDetail extends MaterialPoListItem {
  notes: string | null;
  lines: MaterialPoLineItem[];
  deliveries: Array<{
    id: string;
    deliveryCode: string;
    deliveryDate: string;
    qualityCheckStatus: MaterialQualityStatus;
  }>;
}

export async function getMaterialPO(idOrCode: string): Promise<MaterialPoDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  // Source list is now org-scoped, so `summary` can only be one of the
  // caller's own POs — this closes the cross-tenant IDOR.
  const list = await getMaterialPurchaseOrders();
  const summary = list.find((p) => p.id === idOrCode || p.poCode === idOrCode);
  if (!summary) return null;

  const [base] = await db
    .select({ notes: materialPurchaseOrders.notes })
    .from(materialPurchaseOrders)
    .where(
      and(
        eq(materialPurchaseOrders.id, summary.id),
        eq(materialPurchaseOrders.organizationId, organizationId),
      ),
    )
    .limit(1);

  const lines = await db
    .select()
    .from(materialPoLines)
    .where(
      and(
        eq(materialPoLines.poId, summary.id),
        eq(materialPoLines.organizationId, organizationId),
      ),
    )
    .orderBy(materialPoLines.lineNumber);

  const deliveries = await db
    .select({
      id: materialDeliveries.id,
      deliveryCode: materialDeliveries.deliveryCode,
      deliveryDate: materialDeliveries.deliveryDate,
      qualityCheckStatus: materialDeliveries.qualityCheckStatus,
    })
    .from(materialDeliveries)
    .where(
      and(
        eq(materialDeliveries.poId, summary.id),
        eq(materialDeliveries.organizationId, organizationId),
      ),
    );

  return {
    ...summary,
    notes: base?.notes ?? null,
    lines: lines.map((l) => ({
      id: l.id,
      lineNumber: l.lineNumber,
      materialName: l.materialName,
      materialCategory: l.materialCategory ?? null,
      unitOfMeasure: l.unitOfMeasure,
      quantityOrdered: String(l.quantityOrdered),
      quantityDelivered: String(l.quantityDelivered),
      quantityConsumed: String(l.quantityConsumed),
      unitPriceUsdMinor: toStr(l.unitPriceUsdMinor),
      lineTotalUsdMinor: l.lineTotalUsdMinor ? String(l.lineTotalUsdMinor) : null,
    })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      deliveryCode: d.deliveryCode,
      deliveryDate: String(d.deliveryDate),
      qualityCheckStatus: d.qualityCheckStatus as MaterialQualityStatus,
    })),
  };
}

export interface MaterialDeliveryListItem {
  id: string;
  deliveryCode: string;
  poId: string;
  poCode: string;
  vendorLegalName: string;
  projectName: string | null;
  deliveryDate: string;
  qualityCheckStatus: MaterialQualityStatus;
  receivedAt: string | null;
  lineCount: number;
}

export interface MaterialDeliveryFilters {
  projectId?: string;
  vendorId?: string;
  qualityCheckStatus?: MaterialQualityStatus;
  fromDate?: string;
  toDate?: string;
}

export async function getMaterialDeliveries(
  filters: MaterialDeliveryFilters = {},
): Promise<MaterialDeliveryListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const conditions: ReturnType<typeof sql>[] = [
    sql`d.organization_id = ${organizationId}`,
  ];
  if (filters.projectId)
    conditions.push(sql`po.project_id = ${filters.projectId}`);
  if (filters.vendorId) conditions.push(sql`po.vendor_id = ${filters.vendorId}`);
  if (filters.qualityCheckStatus)
    conditions.push(sql`d.quality_check_status = ${filters.qualityCheckStatus}`);
  if (filters.fromDate)
    conditions.push(sql`d.delivery_date >= ${filters.fromDate}`);
  if (filters.toDate) conditions.push(sql`d.delivery_date <= ${filters.toDate}`);
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await db.execute(sql`
    SELECT
      d.id, d.delivery_code, d.po_id, po.po_code,
      v.legal_name AS vendor_legal_name, p.name AS project_name,
      d.delivery_date, d.quality_check_status, d.received_at,
      coalesce(l.line_count, 0)::int AS line_count
    FROM material_deliveries d
    JOIN material_purchase_orders po ON po.id = d.po_id
    JOIN vendors v ON v.id = po.vendor_id
    LEFT JOIN projects p ON p.id = po.project_id
    LEFT JOIN (
      SELECT delivery_id, count(*)::int AS line_count
      FROM material_delivery_lines GROUP BY delivery_id
    ) l ON l.delivery_id = d.id
    ${where}
    ORDER BY d.delivery_date DESC
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    deliveryCode: String(r.delivery_code),
    poId: String(r.po_id),
    poCode: String(r.po_code),
    vendorLegalName: String(r.vendor_legal_name),
    projectName: r.project_name ? String(r.project_name) : null,
    deliveryDate: String(r.delivery_date),
    qualityCheckStatus: String(r.quality_check_status) as MaterialQualityStatus,
    receivedAt: r.received_at
      ? new Date(r.received_at as string).toISOString()
      : null,
    lineCount: toNum(r.line_count),
  }));
}

export async function getMaterialDelivery(
  id: string,
): Promise<MaterialDeliveryListItem | null> {
  const list = await getMaterialDeliveries();
  return list.find((d) => d.id === id || d.deliveryCode === id) ?? null;
}

export interface MaterialUtilization {
  poId: string;
  totalLines: number;
  totalQtyOrdered: number;
  totalQtyDelivered: number;
  totalQtyConsumed: number;
  outstandingQty: number;
}

export async function getMaterialUtilization(
  poId: string,
): Promise<MaterialUtilization> {
  const db = getDb();
  if (!db) {
    return {
      poId,
      totalLines: 0,
      totalQtyOrdered: 0,
      totalQtyDelivered: 0,
      totalQtyConsumed: 0,
      outstandingQty: 0,
    };
  }
  const organizationId = await requireOrgId();
  const [r] = await db.execute(sql`
    SELECT
      count(*)::int AS line_count,
      coalesce(sum(quantity_ordered), 0)::numeric AS qty_ordered,
      coalesce(sum(quantity_delivered), 0)::numeric AS qty_delivered,
      coalesce(sum(quantity_consumed), 0)::numeric AS qty_consumed
    FROM material_po_lines
    WHERE po_id = ${poId}
      AND organization_id = ${organizationId}
  `);
  const row = (r ?? {}) as Record<string, unknown>;
  const ordered = Number(row.qty_ordered ?? 0);
  const delivered = Number(row.qty_delivered ?? 0);
  return {
    poId,
    totalLines: toNum(row.line_count),
    totalQtyOrdered: ordered,
    totalQtyDelivered: delivered,
    totalQtyConsumed: Number(row.qty_consumed ?? 0),
    outstandingQty: ordered - delivered,
  };
}
