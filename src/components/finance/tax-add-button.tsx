/**
 * Stage 10.6.B.4 — Modal-First Add for finance/taxes.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { LedgerLineForm } from "./ledger-line-form";
import { createTaxLineAction } from "@/features/finance/actions";

const TAX_CATEGORIES = [
  "local_hospitality_tax",
  "vat",
  "income_tax_reserve",
  "withholding_tax",
  "platform_collected_tax",
  "other",
];

export function TaxAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New tax line"
      modalTitle="New tax line"
      formComponent={LedgerLineForm}
      formProps={{
        title: "Tax line",
        cancelHref: "/dashboard/finance/taxes",
        action: createTaxLineAction,
        dateName: "taxDate",
        dateLabel: "Tax date",
        categoryName: "taxType",
        categoryLabel: "Tax type",
        categoryOptions: TAX_CATEGORIES,
        villas,
        projects,
        submitLabel: "Post tax",
      }}
      newRouteHref="/dashboard/finance/taxes/new"
      size="lg"
      testId="tax-add-trigger"
    />
  );
}
