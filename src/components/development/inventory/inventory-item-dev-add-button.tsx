"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { InventoryItemForm } from "./inventory-item-form";

export function InventoryItemDevAddButton() {
  return (
    <ModalFirstAddButton
      label="New item"
      modalTitle="New inventory item"
      formComponent={InventoryItemForm}
      formProps={{}}
      newRouteHref="/development-os/inventory/items/new"
      size="lg"
      testId="dev-inventory-item-add-trigger"
    />
  );
}
