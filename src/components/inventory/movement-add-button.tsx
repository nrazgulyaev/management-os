/**
 * Stage 10.6.B.4 — Modal-First Add for stock movements.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { MovementForm } from "./movement-form";

export function MovementAddButton({
  items,
  locations,
}: {
  items: { id: string; label: string }[];
  locations: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New movement"
      modalTitle="New stock movement"
      modalDescription="Receive, consume, transfer, adjust, write-off, or return to supplier."
      formComponent={MovementForm}
      formProps={{
        items,
        locations,
        cancelHref: "/dashboard/inventory/movements",
      }}
      newRouteHref="/dashboard/inventory/movements/new"
      size="xl"
      testId="movement-add-trigger"
    />
  );
}
