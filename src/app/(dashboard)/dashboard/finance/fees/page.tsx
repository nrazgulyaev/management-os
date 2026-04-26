import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listFeeLines } from "@/features/finance/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Fee ledger" };
export const dynamic = "force-dynamic";

export default async function FeesPage() {
  const rows = await listFeeLines();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Fees" }]}
        title="Fees"
        description="OTA commission, payment processing, bank, FX, agent and manager commissions."
        actions={
          <Button asChild>
            <Link href="/dashboard/finance/fees/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New fee
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <FinanceTable
        rows={rows.map((r) => ({
          id: r.id,
          date: r.feeDate,
          scope: r.villaCode ?? "—",
          category: r.feeType,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
