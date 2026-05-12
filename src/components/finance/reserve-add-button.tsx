/**
 * Stage 10.6.B.4 — Modal-First Add for finance/reserves.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { LedgerLineForm } from "./ledger-line-form";
import { Field, selectCls } from "@/components/admin/form-shell";
import { createReserveMovementAction } from "@/features/finance/actions";

export function ReserveAddButton({
  villas,
  projects,
  owners,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  owners: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New movement"
      modalTitle="New reserve movement"
      formComponent={LedgerLineForm}
      formProps={{
        title: "Reserve movement",
        cancelHref: "/dashboard/finance/reserves",
        action: createReserveMovementAction,
        dateName: "movementDate",
        dateLabel: "Movement date",
        categoryName: "reserveType",
        categoryLabel: "Reserve type",
        categoryOptions: ["renovation", "depreciation", "ffe", "maintenance", "tax", "emergency", "other"],
        villas,
        projects,
        owners,
        submitLabel: "Post movement",
        extraFields: (
          <Field label="Movement type" required>
            <select name="movementType" defaultValue="contribution" className={selectCls}>
              <option value="contribution">Contribution</option>
              <option value="release">Release</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </Field>
        ),
      }}
      newRouteHref="/dashboard/finance/reserves/new"
      size="xl"
      testId="reserve-add-trigger"
    />
  );
}
