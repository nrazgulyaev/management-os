/**
 * Stage 10.6.B.4 — Modal-First Add for finance/periods.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PeriodForm } from "@/app/(dashboard)/dashboard/finance/periods/new/form";

export function PeriodAddButton() {
  return (
    <ModalFirstAddButton
      label="New period"
      modalTitle="New statement period"
      formComponent={PeriodForm}
      formProps={{}}
      newRouteHref="/dashboard/finance/periods/new"
      size="lg"
      testId="period-add-trigger"
    />
  );
}
