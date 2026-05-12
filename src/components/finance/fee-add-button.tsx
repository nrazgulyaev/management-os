/**
 * Stage 10.6.B.4 — Modal-First Add for finance/fees.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { LedgerLineForm } from "./ledger-line-form";
import { createFeeLineAction } from "@/features/finance/actions";

const FEE_CATEGORIES = [
  "ota_commission",
  "payment_processing",
  "bank_fee",
  "currency_conversion",
  "agent_commission",
  "manager_commission",
  "platform_subscription",
  "other",
];

export function FeeAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New fee"
      modalTitle="New fee line"
      modalDescription="OTA, payment, bank, FX, agent, manager — every commission is its own row, never bundled into expenses."
      formComponent={LedgerLineForm}
      formProps={{
        title: "Fee line",
        cancelHref: "/dashboard/finance/fees",
        action: createFeeLineAction,
        dateName: "feeDate",
        dateLabel: "Fee date",
        categoryName: "feeType",
        categoryLabel: "Fee type",
        categoryOptions: FEE_CATEGORIES,
        villas,
        projects,
        submitLabel: "Post fee",
      }}
      newRouteHref="/dashboard/finance/fees/new"
      size="lg"
      testId="fee-add-trigger"
    />
  );
}
