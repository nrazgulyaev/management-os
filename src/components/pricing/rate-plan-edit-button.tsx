/**
 * Modal-First "Edit" trigger for a rate plan detail page.
 *
 * Mirrors the create flow (villa-add-button.tsx) but opens the EDIT form,
 * pre-filled from the loaded plan, so a plan can be renamed, re-scoped,
 * re-priced, or archived (status select) in place. The underlying
 * updateRatePlanAction already enforces permission + org-scoping + audit.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import {
  EditRatePlanForm,
  type EditRatePlanDefaults,
} from "@/components/pricing/edit-rate-plan-form";

export function RatePlanEditButton({
  plan,
  villas,
  projects,
}: {
  plan: EditRatePlanDefaults;
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Edit"
      modalTitle="Edit rate plan"
      modalDescription="Rename, re-scope, re-price, or archive this rate plan."
      formComponent={EditRatePlanForm}
      formProps={{ plan, villas, projects }}
      size="lg"
      variant="secondary"
      hideIcon
      testId="rate-plan-edit-trigger"
    />
  );
}
