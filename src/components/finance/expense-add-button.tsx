/**
 * Stage 10.6.B.4 — Modal-First Add for finance/expenses.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { LedgerLineForm } from "./ledger-line-form";
import { Field, selectCls } from "@/components/admin/form-shell";
import { createExpenseLineAction } from "@/features/finance/actions";

const EXPENSE_CATEGORIES = [
  "utilities", "electricity", "water", "internet", "gas",
  "cleaning", "laundry", "toiletries", "pool", "garden", "pest_control",
  "maintenance", "repair", "capex", "renovation",
  "linen_replacement", "towel_replacement",
  "staff_allocation", "security", "software", "other",
];

export function ExpenseAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New expense"
      modalTitle="New expense"
      modalDescription="Choose the right allocation scope so the expense flows correctly into owner statements."
      formComponent={LedgerLineForm}
      formProps={{
        title: "Expense line",
        cancelHref: "/dashboard/finance/expenses",
        action: createExpenseLineAction,
        dateName: "expenseDate",
        dateLabel: "Expense date",
        categoryName: "expenseType",
        categoryLabel: "Expense type",
        categoryOptions: EXPENSE_CATEGORIES,
        villas,
        projects,
        submitLabel: "Post expense",
        extraFields: (
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
        ),
      }}
      newRouteHref="/dashboard/finance/expenses/new"
      size="xl"
      testId="expense-add-trigger"
    />
  );
}
