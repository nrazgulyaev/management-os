/**
 * Stage 10.6.B.4 — Modal-First Add for projects.
 *
 * Replaces the legacy `<Link href="/dashboard/projects/new">New project</Link>`
 * with an inline modal that opens the create-project form. The /new
 * route still works as a deep-link fallback.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { ProjectForm } from "@/features/projects/form";

export function ProjectAddButton() {
  return (
    <ModalFirstAddButton
      label="New project"
      modalTitle="New project"
      modalDescription="Create a new Bali villa project."
      formComponent={ProjectForm}
      formProps={{ mode: "create" as const }}
      newRouteHref="/dashboard/projects/new"
      size="xl"
      testId="project-add-trigger"
    />
  );
}
