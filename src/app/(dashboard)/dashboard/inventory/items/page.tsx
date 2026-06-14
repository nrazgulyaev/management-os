import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ItemCard } from "@/components/inventory/item-card";
import { listInventoryItems } from "@/features/inventory/services";
import { InventoryRowActions } from "@/components/dashboard/inventory/inventory-row-actions";
import { AddInventoryItemButton } from "@/components/dashboard/inventory/inventory-add-buttons";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Inventory · Items" };
export const dynamic = "force-dynamic";

export default async function InventoryItemsPage() {
  const items = await listInventoryItems({ limit: 500 });
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <span>Items</span>
          </div>
          <h1>All items</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Catalog of consumables, linens, towels, amenities, chemicals, spare parts, and equipment.
          </p>
        </div>
        <div className="actions">
          <AddInventoryItemButton />
        </div>
      </div>
      <DbStatusNotice />
      {items.length === 0 ? (
        <NoItemsYet
          entityLabel="items"
          description="Add your first inventory item to start tracking stock movements across locations."
          addAction={<AddInventoryItemButton />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((i) => (
            <div key={i.id} className="relative">
              <ItemCard item={i} href={`/dashboard/inventory/items/${i.id}`} />
              <div className="absolute top-3 right-3 z-10">
                <InventoryRowActions
                  kind="item"
                  row={{
                    id: i.id,
                    name: i.name,
                    sku: i.sku ?? null,
                    unit: i.unit,
                    itemType: i.itemType,
                    description: i.description ?? null,
                    brand: i.brand ?? null,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
