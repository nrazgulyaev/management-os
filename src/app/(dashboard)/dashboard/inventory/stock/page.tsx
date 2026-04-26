import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { StockTable } from "@/components/inventory/stock-table";
import { listStockLevels } from "@/features/inventory/services";

export const metadata = { title: "Inventory · Stock" };
export const dynamic = "force-dynamic";

export default async function StockPage() {
  const rows = await listStockLevels();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Stock" },
        ]}
        title="Stock levels"
        description="Per-item, per-location stock with low-stock indicators."
      />
      <DbStatusNotice />
      <StockTable rows={rows} />
    </div>
  );
}
