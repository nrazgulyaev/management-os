import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listExpenseLines } from "@/features/finance/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const rows = await listExpenseLines();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Expenses" }]}
        title="Operating expenses"
        description="Utilities, cleaning, maintenance, capex, renovation. Allocation scope governs how the expense flows into owner statements."
        actions={
          <Button asChild>
            <Link href="/dashboard/finance/expenses/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New expense
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <FinanceTable
        rows={rows.map((r) => ({
          id: r.id,
          date: r.expenseDate,
          scope: r.villaCode ?? r.projectName ?? "—",
          category: `${r.expenseType} · ${r.allocationScope}`,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
