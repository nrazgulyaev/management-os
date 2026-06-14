import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MovementForm } from "@/components/inventory/movement-form";
import {
  listInventoryItems,
  listInventoryLocations,
} from "@/features/inventory/services";

export const metadata = { title: "New stock movement" };
export const dynamic = "force-dynamic";

export default async function NewMovementPage() {
  const [items, locations] = await Promise.all([
    listInventoryItems(),
    listInventoryLocations(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/movements">Movements</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New movement</h1>
        </div>
      </div>
      <DbStatusNotice />
      <MovementForm
        items={items.map((i) => ({ id: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}` }))}
        locations={locations.map((l) => ({ id: l.id, label: l.name }))}
        cancelHref="/dashboard/inventory/movements"
      />
    </div>
  );
}
