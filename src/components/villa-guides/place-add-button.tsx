"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { PlaceForm } from "./place-form";

export function PlaceAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Add place"
      modalTitle="Add neighborhood place"
      formComponent={PlaceForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/villa-guides/neighborhood/new"
      size="xl"
      testId="neighborhood-place-add-trigger"
    />
  );
}
