import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { StockTable } from "@/components/inventory/stock-table";
import { listStockLevels } from "@/features/inventory/services";

export const metadata = { title: "Inventory · Stock" };
export const dynamic = "force-dynamic";

export default async function StockPage() {
  const rows = await listStockLevels();

  // KPI strip derived from the same fetch — no extra query.
  const skuCount = new Set(rows.map((r) => r.itemId)).size;
  const locationCount = new Set(rows.map((r) => r.locationId)).size;
  const lowRows = rows.filter(
    (r) => r.reorderPoint !== null && r.quantity <= r.reorderPoint && r.quantity > 0,
  );
  const outRows = rows.filter((r) => r.quantity <= 0);
  const reservedTotal = rows.reduce((s, r) => s + r.reservedQuantity, 0);
  const attention = lowRows.length + outRows.length;

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Workspace</Link> /{" "}
            <Link href="/dashboard/inventory">Inventory</Link> / <span>Stock</span>
          </div>
          <h1>
            Stock levels
            {attention > 0 && (
              <em className="text-terra italic">
                {" "}
                · {attention} need{attention === 1 ? "s" : ""} attention
              </em>
            )}
          </h1>
          <p className="page-header-meta">
            <span>
              {skuCount} SKU{skuCount === 1 ? "" : "s"}
            </span>
            <span>
              {locationCount} location{locationCount === 1 ? "" : "s"}
            </span>
            <span>per-item · per-location</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="SKUs" value={String(skuCount)} sub={`${locationCount} locations`} />
        <Kpi
          label="Low stock"
          value={String(lowRows.length)}
          sub={lowRows.length > 0 ? "below reorder" : "all stocked"}
          tone={lowRows.length > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Out of stock"
          value={String(outRows.length)}
          sub={outRows.length > 0 ? "reorder now" : "none"}
          tone={outRows.length > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Reserved"
          value={reservedTotal.toLocaleString()}
          sub="across locations"
        />
      </div>

      <DbStatusNotice />
      <div className="mt-[18px]">
        <StockTable rows={rows} />
      </div>
    </>
  );
}
