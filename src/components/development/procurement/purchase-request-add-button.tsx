"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PurchaseRequestMobileForm } from "./purchase-request-mobile-form";

export function PurchaseRequestDevAddButton({
  projects,
}: {
  projects: Array<{ id: string; name: string; slug: string }>;
}) {
  return (
    <ModalFirstAddButton
      label="New request"
      modalTitle="New purchase request"
      formComponent={PurchaseRequestMobileForm}
      formProps={{ projects }}
      newRouteHref="/development-os/procurement/purchase-requests/new"
      size="xl"
      testId="dev-purchase-request-add-trigger"
    />
  );
}
