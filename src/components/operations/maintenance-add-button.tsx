/**
 * Stage 10.6.B.4 — Modal-First Add for maintenance tickets.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { MaintenanceTicketForm } from "./maintenance-form";

export function MaintenanceAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New ticket"
      modalTitle="New maintenance ticket"
      modalDescription="A ticket can later be linked to a generated repair task."
      formComponent={MaintenanceTicketForm}
      formProps={{
        villas,
        projects,
        cancelHref: "/dashboard/operations/maintenance",
      }}
      newRouteHref="/dashboard/operations/maintenance/new"
      size="lg"
      testId="maintenance-add-trigger"
    />
  );
}
