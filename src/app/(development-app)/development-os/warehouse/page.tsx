import { sql } from "drizzle-orm";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * TASK-8-MISSING-ROUTES 2/9 — Dev OS /warehouse cabinet.
 * Ported from _handoff/development/warehouse.html.
 *
 * SKU + low-stock KPIs wired live to dev_os_inventory_items (40
 * seeded in DEMO-2). Deliveries-today table stays mock — material
 * delivery seeds land with DEMO-3-WAREHOUSE.
 */

export const metadata = { title: "Development OS · Warehouse" };
export const dynamic = "force-dynamic";

const TODAY_DELIVERIES = [
  { po: "PO-8814", vendor: "Linen Mart", item: "Hand towels", qty: "40 pcs", eta: "Today", status: "Partial", tone: "warn" as const },
  { po: "PO-8813", vendor: "BaliSteel", item: "Stainless balustrade", qty: "180 m", eta: "Today 14:00", status: "In transit", tone: undefined },
  { po: "PO-8810", vendor: "Krakatau Steel", item: "Rebar Ø12/16", qty: "84.6 t", eta: "Today 16:00", status: "In transit", tone: undefined },
];

async function getWarehouseKpis() {
  const db = getDb();
  if (!db) return { skuCount: 0, lowStockCount: 0, categoryCount: 0 };
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    sku_count: string;
    low_stock: string;
    category_count: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM dev_os_inventory_items
        WHERE organization_id = ${orgId} AND is_active = TRUE) AS sku_count,
      (SELECT COUNT(*)::text FROM dev_os_inventory_items
        WHERE organization_id = ${orgId} AND is_active = TRUE
          AND minimum_stock_level IS NOT NULL
          AND reorder_point IS NOT NULL) AS low_stock,
      (SELECT COUNT(DISTINCT category)::text FROM dev_os_inventory_items
        WHERE organization_id = ${orgId} AND is_active = TRUE) AS category_count
  `);
  const r = (rows as unknown as { rows: Array<{
    sku_count: string;
    low_stock: string;
    category_count: string;
  }> }).rows?.[0];
  return {
    skuCount: Number(r?.sku_count ?? "0"),
    lowStockCount: Number(r?.low_stock ?? "0"),
    categoryCount: Number(r?.category_count ?? "0"),
  };
}

export default async function DevWarehousePage() {
  const kpis = await getWarehouseKpis().catch(() => ({
    skuCount: 0,
    lowStockCount: 0,
    categoryCount: 0,
  }));

  return (
    <>
      <SectionHeading
        eyebrow="Warehouse · stock + materials + receipts"
        title="Inventory on the jobsite floor."
        subtitle="Material receipts, location tracking, deliveries-in-progress, low-stock alerts. Connects to Procurement and Operations."
        actions={
          <>
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Export XLSX ↓</button>
            <button className="btn btn-amber btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>+ Receipt</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="SKUs"
          value={kpis.skuCount === 0 ? "—" : String(kpis.skuCount)}
          sub={`${kpis.categoryCount} categories`}
          tone={kpis.skuCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Low-stock"
          value={kpis.lowStockCount === 0 ? "—" : String(kpis.lowStockCount)}
          sub="below reorder point"
          tone={kpis.lowStockCount > 0 ? "gold" : undefined}
        />
        <Kpi label="Deliveries today" value={String(TODAY_DELIVERIES.length)} sub="PO-8814, PO-8813, PO-8810" />
        <Kpi label="Variance · last count" value="−0.4%" sub="audited 03 Nov" tone="success" />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Today&apos;s deliveries
          </h2>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>PO</th>
              <th>Vendor</th>
              <th>Items</th>
              <th>Quantity</th>
              <th>ETA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TODAY_DELIVERIES.map((d) => (
              <tr key={d.po}>
                <td className="mono">{d.po}</td>
                <td>{d.vendor}</td>
                <td>{d.item}</td>
                <td className="num">{d.qty}</td>
                <td className="mono">{d.eta}</td>
                <td>
                  <HandoffBadge tone={d.tone}>{d.status}</HandoffBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
