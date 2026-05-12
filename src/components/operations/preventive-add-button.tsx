/**
 * Stage 10.6.B.4 — Modal-First Add for preventive schedules.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PreventiveScheduleForm } from "./preventive-form";

export function PreventiveAddButton({
  villas,
  projects,
  templates,
  appUsers,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  templates: { id: string; label: string }[];
  appUsers: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New schedule"
      modalTitle="New preventive schedule"
      modalDescription="Recurring inspections and services. The runtime mints a new task each time the schedule comes due."
      formComponent={PreventiveScheduleForm}
      formProps={{
        villas,
        projects,
        templates,
        appUsers,
        cancelHref: "/dashboard/operations/preventive",
      }}
      newRouteHref="/dashboard/operations/preventive/new"
      size="xl"
      testId="preventive-add-trigger"
    />
  );
}
