"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CreateVendorForm } from "./create-vendor-form";

export function VendorAddButton() {
  return (
    <ModalFirstAddButton
      label="New vendor"
      modalTitle="New service vendor"
      modalDescription="Register a new vendor. Map them to specific guest services on the vendor detail page."
      formComponent={CreateVendorForm}
      formProps={{}}
      newRouteHref="/dashboard/service-fulfilment/vendors/new"
      size="xl"
      testId="service-vendor-add-trigger"
    />
  );
}
