import { PageHeader } from "@/components/ui/page-header";
import { listExpenseLines } from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { ExpenseAddButton } from "@/components/finance/expense-add-button";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [rows, villas, projects] = await Promise.all([
    listExpenseLines(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Expenses" }]}
        title="Operating expenses"
        description="Utilities, cleaning, maintenance, capex, renovation. Allocation scope governs how the expense flows into owner statements."
        actions={<ExpenseAddButton villas={villaOpts} projects={projectOpts} />}
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
