import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MovementTable } from "@/components/inventory/movement-table";
import { listInventoryMovements } from "@/features/inventory/services";

export const metadata = { title: "Inventory · Movements" };
export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  const rows = await listInventoryMovements({ limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Movements" },
        ]}
        title="Inventory movements"
        description="Receive, consume, transfer, adjust, write-off — every change to stock is here."
        actions={
          <Button asChild>
            <Link href="/dashboard/inventory/movements/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New movement
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <MovementTable rows={rows} />
    </div>
  );
}
