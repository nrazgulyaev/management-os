"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { OwnerForm } from "@/features/owners/form";

export function OwnerAddButton() {
  return (
    <ModalFirstAddButton
      label="New owner"
      modalTitle="New owner"
      formComponent={OwnerForm}
      formProps={{ mode: "create" as const }}
      newRouteHref="/dashboard/owners/new"
      size="xl"
      testId="owner-add-trigger"
    />
  );
}
