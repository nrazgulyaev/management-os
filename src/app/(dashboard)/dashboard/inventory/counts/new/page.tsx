import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { NewInventoryCountForm } from "@/components/inventory-counts/count-form";
import { listInventoryLocations } from "@/features/inventory/services";

export const metadata = { title: "New inventory count" };
export const dynamic = "force-dynamic";

export default async function NewCountPage() {
  const locations = await listInventoryLocations();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Counts", href: "/dashboard/inventory/counts" },
          { label: "New" },
        ]}
        title="New stock count"
      />
      <DbStatusNotice />
      <NewInventoryCountForm
        locations={locations.map((l) => ({ id: l.id, label: l.name }))}
        cancelHref="/dashboard/inventory/counts"
      />
    </div>
  );
}
