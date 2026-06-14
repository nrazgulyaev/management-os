import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { LedgerLineForm } from "@/components/finance/ledger-line-form";
import { Field, selectCls } from "@/components/admin/form-shell";
import { createExpenseLineAction } from "@/features/finance/actions";

export const metadata = { title: "New expense" };
export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/expenses">Expenses</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New expense</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Choose the right allocation scope so the expense flows correctly into owner statements.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <LedgerLineForm
        title="Expense line"
        cancelHref="/dashboard/finance/expenses"
        action={createExpenseLineAction}
        dateName="expenseDate"
        dateLabel="Expense date"
        categoryName="expenseType"
        categoryLabel="Expense type"
        categoryOptions={[
          "utilities",
          "electricity",
          "water",
          "internet",
          "gas",
          "cleaning",
          "laundry",
          "toiletries",
          "pool",
          "garden",
          "pest_control",
          "maintenance",
          "repair",
          "capex",
          "renovation",
          "linen_replacement",
          "towel_replacement",
          "staff_allocation",
          "security",
          "software",
          "other",
        ]}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        submitLabel="Post expense"
        extraFields={
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Allocation scope" required hint="Where the cost lands">
              <select name="allocationScope" defaultValue="villa" className={selectCls}>
                <option value="villa">Villa-specific</option>
                <option value="project_pool">Project pool (shared)</option>
                <option value="company">Company-absorbed</option>
                <option value="booking">Booking-attached</option>
                <option value="owner_direct">Owner direct</option>
              </select>
            </Field>
            <Field label="Capitalised">
              <select name="capitalized" defaultValue="false" className={selectCls}>
                <option value="false">No</option>
                <option value="true">Yes (depreciation tracked separately)</option>
              </select>
            </Field>
          </div>
        }
      />
    </div>
  );
}
