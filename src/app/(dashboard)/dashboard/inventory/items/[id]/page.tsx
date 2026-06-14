import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffBadge, Kpi } from "@/components/dashboard/primitives";
import { StockTable } from "@/components/inventory/stock-table";
import { MovementTable } from "@/components/inventory/movement-table";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  getInventoryItemById,
  listInventoryMovements,
  listStockLevels,
} from "@/features/inventory/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Inventory item" };
export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getInventoryItemById(id);
  if (!item) notFound();
  const [stock, movements] = await Promise.all([
    listStockLevels({ itemId: id }),
    listInventoryMovements({ itemId: id, limit: 50 }),
  ]);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/items">Items</Link> /{" "}
            <span>{item.sku ?? item.name}</span>
          </div>
          <h1>{item.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2">
            {item.itemType.replace(/_/g, " ")}
            {item.brand ? ` · ${item.brand}` : ""}
          </p>
        </div>
      </div>
      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="SKU" value={<span className="mono">{item.sku ?? "—"}</span>} />
        <Kpi label="Unit" value={item.unit} />
        <Kpi
          label="Reorder"
          value={
            item.reorderPoint !== null
              ? `${item.reorderPoint} ${item.unit}`
              : "—"
          }
        />
        <Kpi label="Default supplier" value={item.defaultSupplierName ?? "—"} />
        <Kpi
          label="Total stock"
          value={
            <span className="mono tabular-nums">
              {item.totalStock} {item.unit}
            </span>
          }
        />
        <Kpi
          label="Unit cost"
          value={
            item.unitCostMinor !== null && item.currency
              ? formatMoneyMinor(item.unitCostMinor, item.currency)
              : "—"
          }
        />
        <Kpi
          label="Owner chargeable"
          value={item.ownerChargeable ? "Yes" : "No"}
        />
        <Kpi
          label="Status"
          value={<HandoffBadge tone="soft">{item.status}</HandoffBadge>}
        />
      </div>

      <div>
        <div className="label mb-2.5">Stock · Per-location</div>
        <StockTable rows={stock} />
      </div>

      <div>
        <div className="label mb-2.5">History · Recent movements</div>
        <MovementTable rows={movements} />
      </div>
    </div>
  );
}
