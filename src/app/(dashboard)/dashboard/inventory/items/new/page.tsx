import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { InventoryItemForm } from "@/components/inventory/item-form";
import { listInventoryCategories, listSuppliers } from "@/features/inventory/services";

export const metadata = { title: "New inventory item" };
export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const [categories, suppliers] = await Promise.all([
    listInventoryCategories(),
    listSuppliers(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Items", href: "/dashboard/inventory/items" },
          { label: "New" },
        ]}
        title="New item"
      />
      <DbStatusNotice />
      <InventoryItemForm
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        cancelHref="/dashboard/inventory/items"
      />
    </div>
  );
}
