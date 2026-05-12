"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { GuideSectionForm } from "./section-form";

export function SectionAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Add section"
      modalTitle="Add guide section"
      formComponent={GuideSectionForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/villa-guides/sections/new"
      size="xl"
      testId="guide-section-add-trigger"
    />
  );
}
