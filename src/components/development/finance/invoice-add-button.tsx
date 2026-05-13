"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { InvoiceCreateForm } from "./invoice-create-form";

export function InvoiceAddButton({
  taxTypes,
  categories,
}: {
  taxTypes: Array<{ id: string; displayName: string; ratePercentage: string }>;
  categories: Array<{ id: string; label: string }>;
}) {
  return (
    <ModalFirstAddButton
      label="New invoice"
      modalTitle="New invoice"
      formComponent={InvoiceCreateForm}
      formProps={{ taxTypes, categories }}
      newRouteHref="/development-os/finance/invoices/new"
      size="xl"
      testId="invoice-add-trigger"
    />
  );
}
