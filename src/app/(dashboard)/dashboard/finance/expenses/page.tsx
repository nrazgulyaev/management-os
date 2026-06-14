import Link from "next/link";
import { listExpenseLines } from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { ExpenseAddButton } from "@/components/finance/expense-add-button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ListTableCard } from "@/components/ui/primitives";

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
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <span>Expenses</span>
          </div>
          <h1>Operating expenses</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Utilities, cleaning, maintenance, capex, renovation. Allocation scope governs how the expense flows into owner statements.
          </p>
        </div>
        <div className="actions">
          <ExpenseAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <DbStatusNotice />
      <ListTableCard
        eyebrow="Ledger"
        title="All expense lines"
        count={rows.length}
        flushBody={false}
      >
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
      </ListTableCard>
    </div>
  );
}
