/**
 * Stage 10.6.B.4 — Modal-First Add for rate plans.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CreateRatePlanForm } from "./create-rate-plan-form";

export function RatePlanAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New plan"
      modalTitle="New rate plan"
      modalDescription="Rate plans price bookings. Scope per villa, per project, or globally; villa beats project beats global."
      formComponent={CreateRatePlanForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/bookings/rates/new"
      size="lg"
      testId="rate-plan-add-trigger"
    />
  );
}
