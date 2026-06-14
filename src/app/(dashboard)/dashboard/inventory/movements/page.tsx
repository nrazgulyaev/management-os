import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MovementTable } from "@/components/inventory/movement-table";
import { MovementAddButton } from "@/components/inventory/movement-add-button";
import {
  listInventoryItems,
  listInventoryLocations,
  listInventoryMovements,
} from "@/features/inventory/services";

export const metadata = { title: "Inventory · Movements" };
export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  const [rows, items, locations] = await Promise.all([
    listInventoryMovements({ limit: 200 }),
    listInventoryItems({ limit: 500 }),
    listInventoryLocations(),
  ]);
  const itemOpts = items.map((i) => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}`,
  }));
  const locationOpts = locations.map((l) => ({ id: l.id, label: l.name }));
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <span>Movements</span>
          </div>
          <h1>Inventory movements</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Receive, consume, transfer, adjust, write-off — every change to
            stock is here.
          </p>
        </div>
        <div className="actions">
          <MovementAddButton items={itemOpts} locations={locationOpts} />
        </div>
      </div>
      <DbStatusNotice />
      <MovementTable rows={rows} />
    </div>
  );
}
