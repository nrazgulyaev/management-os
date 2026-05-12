/**
 * Stage 10.6.B.4 — Modal-First Add for villas.
 *
 * Replaces the legacy `<Link href="/dashboard/villas/new">Add villa</Link>`
 * trigger with an inline modal that opens the create-villa form.
 * The /new route still works as a deep-link fallback (rendered as the
 * "Open as full page" footer link inside the modal).
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { VillaForm } from "@/features/villas/form";

export function VillaAddButton({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Add villa"
      modalTitle="New villa"
      modalDescription="Create a new villa unit. The unit code must be unique inside the project."
      formComponent={VillaForm}
      formProps={{
        mode: "create" as const,
        projects,
      }}
      newRouteHref="/dashboard/villas/new"
      size="xl"
      testId="villa-add-trigger"
    />
  );
}
