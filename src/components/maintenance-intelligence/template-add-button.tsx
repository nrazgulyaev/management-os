/**
 * Stage 10.6.B.4 — Modal-First Add for maintenance templates.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { TemplateForm } from "./template-form";

export function TemplateAddButton() {
  return (
    <ModalFirstAddButton
      label="New template"
      modalTitle="New maintenance template"
      formComponent={TemplateForm}
      formProps={{}}
      newRouteHref="/dashboard/maintenance-intelligence/templates/new"
      size="xl"
      testId="maintenance-template-add-trigger"
    />
  );
}
