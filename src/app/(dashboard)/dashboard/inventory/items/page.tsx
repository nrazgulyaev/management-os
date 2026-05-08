import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ItemCard } from "@/components/inventory/item-card";
import { listInventoryItems } from "@/features/inventory/services";
import { InventoryRowActions } from "@/components/dashboard/inventory/inventory-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Inventory · Items" };
export const dynamic = "force-dynamic";

export default async function InventoryItemsPage() {
  const items = await listInventoryItems({ limit: 500 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Items" },
        ]}
        title="All items"
        description="Catalog of consumables, linens, towels, amenities, chemicals, spare parts, and equipment."
        actions={
          <Button asChild>
            <Link href="/dashboard/inventory/items/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New item
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      {items.length === 0 ? (
        <NoItemsYet
          entityLabel="items"
          description="Add your first inventory item to start tracking stock movements across locations."
          addHref="/dashboard/inventory/items/new"
          addLabel="New item"
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
