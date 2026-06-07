import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { safeQuery } from "@/lib/development/safe-query";
import { loadWarehouseCabinet } from "@/lib/development/server/cabinets/warehouse-cabinet-queries";

/**
 * Dev OS /warehouse cabinet. KPI strip + recent-movements activity rail
 * are live via loadWarehouseCabinet (dev_os_inventory_items +
 * dev_os_inventory_movements). The mock "today's deliveries" table is
 * retired in favour of the live movements feed — delivery/PO receipt
 * rows land with a future procurement-receipt schema.
 */

export const metadata = { title: "Development OS · Warehouse" };
export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function DevWarehousePage() {
  const data = await safeQuery("devWarehouseCabinet", loadWarehouseCabinet(), {
    totalSkuCount: 0,
    lowStockItemsCount: 0,
    zeroStockItemsCount: 0,
    todayMovementsCount: 0,
    qaqcLinkedToMaterialsCount: 0,
    pendingDeliveriesCount: 0,
    movementsLast7Days: [],
    recentMovements: [],
  });

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
          value={data.totalSkuCount === 0 ? "—" : String(data.totalSkuCount)}
          sub="active items"
          tone={data.totalSkuCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Low-stock"
          value={data.lowStockItemsCount === 0 ? "—" : String(data.lowStockItemsCount)}
          sub="below reorder point"
          tone={data.lowStockItemsCount > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Zero-stock"
          value={data.zeroStockItemsCount === 0 ? "—" : String(data.zeroStockItemsCount)}
          sub="out of stock"
          tone={data.zeroStockItemsCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Movements · today"
          value={String(data.todayMovementsCount)}
          sub={`${data.pendingDeliveriesCount} pending deliveries`}
        />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Recent stock movements
          </h2>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Item</th>
              <th className="num">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {data.recentMovements.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  No stock movements yet. Receipts + issues appear here as they happen.
                </td>
              </tr>
            ) : (
              data.recentMovements.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{fmtDate(m.movementDate)}</td>
                  <td>
                    <HandoffBadge tone={m.movementType === "receipt" || m.movementType === "in" ? "ok" : undefined}>
                      {m.movementType}
                    </HandoffBadge>
                  </td>
                  <td>{m.itemName ?? "—"}</td>
                  <td className="num">{m.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
