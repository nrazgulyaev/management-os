import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { InventoryItemAddButton } from "@/components/inventory/inventory-item-add-button";
import { MovementAddButton } from "@/components/inventory/movement-add-button";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import {
  listInventoryCategories,
  listInventoryItems,
  listInventoryLocations,
  listInventoryMovements,
  listLowStockItems,
  listSuppliers,
} from "@/features/inventory/services";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const MV_TONE: Record<string, "success" | "neutral" | "info" | "warning"> = {
  receive: "success",
  consume: "neutral",
  transfer: "info",
  adjustment: "warning",
  adjust: "warning",
  count: "neutral",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function InventoryHomePage() {
  // safeList: an RLS denial / missing relation on any one feed must not 500
  // the whole hub.
  const [itemsR, lowStockR, locationsR, recentMovementsR, categoriesR, suppliersR] =
    await Promise.all([
      safeList("inventory.items", () => listInventoryItems({ limit: 500 })),
      safeList("inventory.lowStock", () => listLowStockItems()),
      safeList("inventory.locations", () => listInventoryLocations()),
      safeList("inventory.movements", () => listInventoryMovements({ limit: 12 })),
      safeList("inventory.categories", () => listInventoryCategories()),
      safeList("inventory.suppliers", () => listSuppliers()),
    ]);
  const items = itemsR.value;
  const lowStock = lowStockR.value;
  const locations = locationsR.value;
  const recentMovements = recentMovementsR.value;
  const categoryOpts = categoriesR.value.map((c) => ({ id: c.id, label: c.name }));
  const supplierOpts = suppliersR.value.map((s) => ({ id: s.id, label: s.name }));
  const movementItemOpts = items.map((i) => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}`,
  }));
  const locationOpts = locations.map((l) => ({ id: l.id, label: l.name }));
  const lastScanRun = await getLastRunByJobKey("scan_low_stock").catch(() => null);

  const stockUnits = items.reduce((sum, i) => sum + i.totalStock, 0);
  const valueMinor = items.reduce(
    (sum, i) => sum + i.totalStock * Number(i.unitCostMinor ?? 0n),
    0,
  );
  const currency = items.find((i) => i.currency)?.currency ?? "";
  const valueLabel =
    valueMinor > 0
      ? `${currency} ${Math.round(valueMinor / 100).toLocaleString()}`.trim()
      : "—";

  const itemRows = [...items]
    .sort(
      (a, b) =>
        Number(b.isLowStock) - Number(a.isLowStock) || b.totalStock - a.totalStock,
    )
    .slice(0, 12);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Inventory</span>
          </div>
          <h1>Inventory command center</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Live stock across locations — per-line movements, counts with variance
            reconciliation, and low-stock alerts that feed procurement. One ledger.
          </p>
        </div>
        <div className="actions">
          <MovementAddButton items={movementItemOpts} locations={locationOpts} />
          <InventoryItemAddButton categories={categoryOpts} suppliers={supplierOpts} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Items" value={String(items.length)} sub={`${categoryOpts.length} categories`} />
        <Kpi
          label="Low-stock alerts"
          value={String(lowStock.length)}
          sub={lowStock.length > 0 ? "below reorder" : "all stocked"}
          tone={lowStock.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Stock units"
          value={Math.round(stockUnits).toLocaleString()}
          sub="across locations"
        />
        <Kpi label="Locations" value={String(locations.length)} sub="stock points" />
        <Kpi label="Value at hand" value={valueLabel} sub="cost basis" tone="gold" />
      </div>

      <DbStatusNotice />
      <div className="mt-[18px]">
        <LastRunBadge label="Last automatic low-stock scan" run={lastScanRun} />
      </div>

      {/* Stock levels */}
      <div className="flex items-end justify-between mt-6 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="items">
          Stock levels · <em>by item</em>
        </h2>
        <Link
          href="/dashboard/inventory/items"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All items →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>SKU</th>
              <th className="num">Stock</th>
              <th className="num">Reorder</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {itemRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-3 italic py-8">
                  No items yet. Add one with “+ Item”.
                </td>
              </tr>
            ) : (
              itemRows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link
                      href={`/dashboard/inventory/items/${i.id}`}
                      className="hover:text-terra"
                    >
                      {i.name}
                    </Link>
                  </td>
                  <td className="text-[12px] text-ink-3">{i.categoryName ?? "—"}</td>
                  <td className="mono text-[11px] text-ink-3">{i.sku ?? "—"}</td>
                  <td className="num">
                    {i.totalStock} {i.unit}
                  </td>
                  <td className="num mono text-[12px]">
                    {i.reorderPoint !== null ? `≤${i.reorderPoint}` : "—"}
                  </td>
                  <td>
                    {i.isLowStock ? (
                      <Badge tone="warning">Low</Badge>
                    ) : i.reorderPoint === null ? (
                      <Badge tone="neutral">untracked</Badge>
                    ) : (
                      <Badge tone="success">OK</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent movements */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="movements">
        Recent movements
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Item</th>
              <th>From</th>
              <th>To</th>
              <th className="num">Qty</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {recentMovements.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-ink-3 italic py-8">
                  No inventory movements yet.
                </td>
              </tr>
            ) : (
              recentMovements.map((mv) => (
                <tr key={mv.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(mv.createdAt)}
                  </td>
                  <td>
                    <Badge tone={MV_TONE[mv.movementType] ?? "neutral"}>
                      {mv.movementType}
                    </Badge>
                  </td>
                  <td>{mv.itemName}</td>
                  <td className="text-[12px] text-ink-3">{mv.fromLocationName ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{mv.toLocationName ?? "—"}</td>
                  <td className="num">{mv.quantity}</td>
                  <td className="mono text-[11px] text-ink-3">{mv.movementCode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
