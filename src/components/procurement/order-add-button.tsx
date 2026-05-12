/**
 * Stage 10.6.B.4 — Modal-First Add for procurement orders.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PurchaseOrderForm } from "./order-form";

export function PurchaseOrderAddButton({
  suppliers,
  projects,
  villas,
}: {
  suppliers: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  villas: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New PO"
      modalTitle="New purchase order"
      modalDescription="Lines can be added on the detail page after creation."
      formComponent={PurchaseOrderForm}
      formProps={{
        suppliers,
        projects,
        villas,
        cancelHref: "/dashboard/procurement/orders",
      }}
      newRouteHref="/dashboard/procurement/orders/new"
      size="xl"
      testId="purchase-order-add-trigger"
    />
  );
}
