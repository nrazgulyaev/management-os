/**
 * Stage 10.6.B.4 — Modal-First Add for finance/payouts.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PayoutBatchForm } from "@/app/(dashboard)/dashboard/finance/payouts/new/form";

export function PayoutBatchAddButton() {
  return (
    <ModalFirstAddButton
      label="New batch"
      modalTitle="New payout batch"
      formComponent={PayoutBatchForm}
      formProps={{}}
      newRouteHref="/dashboard/finance/payouts/new"
      size="lg"
      testId="payout-batch-add-trigger"
    />
  );
}
