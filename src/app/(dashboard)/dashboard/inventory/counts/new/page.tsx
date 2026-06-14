import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { NewInventoryCountForm } from "@/components/inventory-counts/count-form";
import { listInventoryLocations } from "@/features/inventory/services";

export const metadata = { title: "New inventory count" };
export const dynamic = "force-dynamic";

export default async function NewCountPage() {
  const locations = await listInventoryLocations();
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/counts">Counts</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New stock count</h1>
        </div>
      </div>
      <DbStatusNotice />
      <NewInventoryCountForm
        locations={locations.map((l) => ({ id: l.id, label: l.name }))}
        cancelHref="/dashboard/inventory/counts"
      />
    </div>
  );
}
