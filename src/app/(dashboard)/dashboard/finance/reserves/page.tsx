import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listReserveMovements } from "@/features/finance/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Reserves" };
export const dynamic = "force-dynamic";

export default async function ReservesPage() {
  const rows = await listReserveMovements();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Reserves" }]}
        title="Reserve movements"
        description="Renovation, FF&E / depreciation, maintenance, tax, emergency. Contributions accrue against the villa or project; releases reduce the balance."
        actions={
          <Button asChild>
            <Link href="/dashboard/finance/reserves/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New reserve movement
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <FinanceTable
        rows={rows.map((r) => ({
          id: r.id,
          date: r.movementDate,
          scope: r.villaId ?? r.projectId ?? "—",
          category: `${r.reserveType} · ${r.movementType}`,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
