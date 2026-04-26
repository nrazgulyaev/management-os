import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Movements", href: "/dashboard/inventory/movements" },
          { label: "New" },
        ]}
        title="New movement"
      />
      <DbStatusNotice />
      <MovementForm
        items={items.map((i) => ({ id: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}` }))}
        locations={locations.map((l) => ({ id: l.id, label: l.name }))}
        cancelHref="/dashboard/inventory/movements"
      />
    </div>
  );
}
