import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { safeQuery } from "@/lib/development/safe-query";
import { loadWarehouseCabinet } from "@/lib/development/server/cabinets/warehouse-cabinet-queries";
import { getReceivingQueue } from "@/lib/development/server/receiving-queries";

/**
 * Dev OS /warehouse cabinet. KPI strip + recent-movements activity rail
 * are live via loadWarehouseCabinet (dev_os_inventory_items +
 * dev_os_inventory_movements). The inbound receiving queue links into the
 * line-by-line receive flow (/warehouse/receive/[poId]) which writes
 * inventory movements; the stock CTA opens /warehouse/stock (cycle count).
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
  const [data, inboundQueue] = await Promise.all([
    safeQuery("devWarehouseCabinet", loadWarehouseCabinet(), {
      totalSkuCount: 0,
      lowStockItemsCount: 0,
      zeroStockItemsCount: 0,
      todayMovementsCount: 0,
      qaqcLinkedToMaterialsCount: 0,
      pendingDeliveriesCount: 0,
      movementsLast7Days: [],
      recentMovements: [],
    }),
    safeQuery("devWarehouseInboundQueue", getReceivingQueue(), [], 6000),
  ]);

  return (
    <>
      <SectionHeading
        eyebrow="Warehouse · stock + materials + receipts"
        title="Inventory on the jobsite floor."
        subtitle="Material receipts, location tracking, deliveries-in-progress, low-stock alerts. Connects to Procurement and Operations."
        actions={
          <>
            <Link href="/development-os/warehouse/stock" className="btn btn-dark btn-sm">
              Stock
            </Link>
          </>
        }
      />

      <nav className="flex flex-wrap gap-2 mb-4" aria-label="Warehouse flow">
        <Link
          href="/development-os/warehouse/picks"
          className="btn btn-amber btn-sm"
        >
          Picks today →
        </Link>
        <Link
          href="/development-os/warehouse/movements"
          className="btn btn-dark btn-sm"
        >
          Movements log →
        </Link>
        <Link
          href="/development-os/warehouse/bins"
          className="btn btn-dark btn-sm"
        >
          Bin map →
        </Link>
      </nav>

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

      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Inbound · at the dock
          </h2>
          <span className="label">{inboundQueue.length} open PO{inboundQueue.length === 1 ? "" : "s"} · FIFO</span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>PO · vendor</th>
              <th className="num">Outstanding</th>
              <th>ETA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {inboundQueue.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  Nothing at the dock. Open POs awaiting receipt appear here, oldest first.
                </td>
              </tr>
            ) : (
              inboundQueue.map((p) => (
                <tr key={p.poId}>
                  <td>
                    <Link href={`/development-os/warehouse/receive/${encodeURIComponent(p.poId)}`} className="row-title hover:underline">
                      {p.poCode}
                    </Link>
                    <span style={{ display: "block", color: "var(--ink-4)", fontSize: 11, marginTop: 1 }}>
                      {p.vendorLegalName}{p.projectName ? ` · ${p.projectName}` : ""}
                    </span>
                  </td>
                  <td className="num">{p.outstandingQty.toFixed(2)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {p.daysToExpected === null
                      ? "—"
                      : p.daysToExpected < 0
                        ? `${Math.abs(p.daysToExpected)}d late`
                        : p.daysToExpected === 0
                          ? "today"
                          : `${p.daysToExpected}d`}
                  </td>
                  <td>
                    <HandoffBadge tone={p.openHoldCount > 0 ? "danger" : p.status === "partially_delivered" ? "warn" : "info"}>
                      {p.openHoldCount > 0 ? "held" : p.status === "partially_delivered" ? "partial" : "ordered"}
                    </HandoffBadge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

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
