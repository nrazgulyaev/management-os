import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listRevenueLines } from "@/features/finance/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Revenue ledger" };
export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const rows = await listRevenueLines();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Revenue" }]}
        title="Revenue ledger"
        description="Booking-attributed revenue, extra services, refunds. Each row maps to a statement line at month end."
        actions={
          <Button asChild>
            <Link href="/dashboard/finance/revenue/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New revenue
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <FinanceTable
        rows={rows.map((r) => ({
          id: r.id,
          date: r.serviceDate,
          scope: r.villaCode ?? r.projectName ?? "—",
          category: r.revenueType,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
