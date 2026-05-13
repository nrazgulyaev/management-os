"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { InventoryMovementForm } from "./movement-form";

export function MovementDevAddButton({
  items,
  locations,
  projects,
}: {
  items: Array<{ id: string; sku: string; displayName: string; unitOfMeasure: string }>;
  locations: Array<{ id: string; locationCode: string; displayName: string; locationType: string }>;
  projects: Array<{ id: string; name: string }>;
}) {
  return (
    <ModalFirstAddButton
      label="New movement"
      modalTitle="Record stock movement"
      formComponent={InventoryMovementForm}
      formProps={{ items, locations, projects }}
      newRouteHref="/development-os/inventory/movements/new"
      size="xl"
      testId="dev-movement-add-trigger"
    />
  );
}
