/**
 * Modal-First "Add line" trigger for a purchase-order detail page.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PurchaseOrderLineForm, type ItemOption } from "./order-line-form";

export function PurchaseOrderLineAddButton({
  purchaseOrderId,
  items,
  currency,
}: {
  purchaseOrderId: string;
  items: ItemOption[];
  currency?: string;
}) {
  return (
    <ModalFirstAddButton
      label="Add line"
      modalTitle="Add order line"
      modalDescription="Append a line item to this purchase order."
      formComponent={PurchaseOrderLineForm}
      formProps={{ purchaseOrderId, items, currency }}
      size="lg"
      testId="purchase-order-line-add-trigger"
    />
  );
}
