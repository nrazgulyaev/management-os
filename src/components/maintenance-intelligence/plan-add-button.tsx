/**
 * Stage 10.6.B.4 — Modal-First Add for maintenance-intelligence plans.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PlanForm, type TemplateOption } from "./plan-form";

export function PlanAddButton({
  villas,
  templates,
}: {
  villas: { id: string; label: string }[];
  templates: TemplateOption[];
}) {
  return (
    <ModalFirstAddButton
      label="New plan"
      modalTitle="New maintenance plan"
      modalDescription="Per-villa instance of a template. The first next_due_at is set to (now + interval); generate the task or accept a window suggestion to advance."
      formComponent={PlanForm}
      formProps={{ villas, templates }}
      newRouteHref="/dashboard/maintenance-intelligence/plans/new"
      size="xl"
      testId="maintenance-plan-add-trigger"
    />
  );
}
