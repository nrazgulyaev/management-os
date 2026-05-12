/**
 * Stage 10.6.B.4 — Modal-First Add for inventory counts.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { NewInventoryCountForm } from "./count-form";

export function CountAddButton({
  locations,
}: {
  locations: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Start count"
      modalTitle="Start a stock count"
      modalDescription="Lines are pre-filled from the location's current stock; counters overwrite the counted column."
      formComponent={NewInventoryCountForm}
      formProps={{
        locations,
        cancelHref: "/dashboard/inventory/counts",
      }}
      newRouteHref="/dashboard/inventory/counts/new"
      size="lg"
      testId="count-add-trigger"
    />
  );
}
