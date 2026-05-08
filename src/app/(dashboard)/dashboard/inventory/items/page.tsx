import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ItemCard } from "@/components/inventory/item-card";
import { listInventoryItems } from "@/features/inventory/services";

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary md:col-span-2">
            No items yet. Add your first inventory item to start tracking
            stock movements across locations.
          </p>
        ) : (
          items.map((i) => (
            <ItemCard key={i.id} item={i} href={`/dashboard/inventory/items/${i.id}`} />
          ))
        )}
      </div>
    </div>
  );
}
