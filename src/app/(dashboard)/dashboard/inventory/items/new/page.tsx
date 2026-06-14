import Link from "next/link";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/items">Items</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New item</h1>
        </div>
      </div>
      <DbStatusNotice />
      <InventoryItemForm
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        cancelHref="/dashboard/inventory/items"
      />
    </div>
  );
}
