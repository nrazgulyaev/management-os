/**
 * Stage 10.6.B.4 — Modal-First Add for procurement requests.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PurchaseRequestForm } from "./request-form";

export function PurchaseRequestAddButton({
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
      label="New request"
      modalTitle="New purchase request"
      modalDescription="Lines + suppliers can be added on the detail page after creation."
      formComponent={PurchaseRequestForm}
      formProps={{
        suppliers,
        projects,
        villas,
        cancelHref: "/dashboard/procurement/requests",
      }}
      newRouteHref="/dashboard/procurement/requests/new"
      size="xl"
      testId="purchase-request-add-trigger"
    />
  );
}
