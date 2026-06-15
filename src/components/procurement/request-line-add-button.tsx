/**
 * Modal-First "Add line" trigger for a purchase-request detail page.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PurchaseRequestLineForm, type ItemOption } from "./request-line-form";

export function PurchaseRequestLineAddButton({
  requestId,
  items,
  currency,
}: {
  requestId: string;
  items: ItemOption[];
  currency?: string;
}) {
  return (
    <ModalFirstAddButton
      label="Add line"
      modalTitle="Add request line"
      modalDescription="Append a line item to this purchase request."
      formComponent={PurchaseRequestLineForm}
      formProps={{ requestId, items, currency }}
      size="lg"
      testId="purchase-request-line-add-trigger"
    />
  );
}
