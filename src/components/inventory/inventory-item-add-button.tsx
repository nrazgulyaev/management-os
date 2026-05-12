/**
 * Stage 10.6.B.4 — Modal-First Add for inventory items.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { InventoryItemForm } from "./item-form";

export function InventoryItemAddButton({
  categories,
  suppliers,
}: {
  categories: { id: string; label: string }[];
  suppliers: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New item"
      modalTitle="New inventory item"
      modalDescription="Catalog SKU, default supplier, reorder thresholds."
      formComponent={InventoryItemForm}
      formProps={{
        categories,
        suppliers,
        cancelHref: "/dashboard/inventory/items",
      }}
      newRouteHref="/dashboard/inventory/items/new"
      size="xl"
      testId="inventory-item-add-trigger"
    />
  );
}
