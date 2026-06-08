/**
 * Wire-up sweep — Modal-First Add for service requests.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { ServiceRequestForm } from "./service-request-form";

export function ServiceRequestAddButton({
  villas,
}: {
  villas: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New request"
      modalTitle="New service request"
      modalDescription="Capture a guest or operational service request."
      formComponent={ServiceRequestForm}
      formProps={{
        villas,
        cancelHref: "/dashboard/operations/service-requests",
      }}
      newRouteHref="/dashboard/operations/service-requests"
      size="lg"
      testId="service-request-add-trigger"
    />
  );
}
