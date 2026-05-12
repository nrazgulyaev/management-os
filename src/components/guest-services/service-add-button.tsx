"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import {
  ServiceEditorForm,
  type CategoryOption,
  type ProjectOption,
  type VillaOption,
} from "./service-editor";

export function ServiceAddButton({
  categories,
  projects,
  villas,
}: {
  categories: CategoryOption[];
  projects: ProjectOption[];
  villas: VillaOption[];
}) {
  return (
    <ModalFirstAddButton
      label="New service"
      modalTitle="New guest service"
      formComponent={ServiceEditorForm}
      formProps={{ categories, projects, villas }}
      newRouteHref="/dashboard/guest-services/catalog/new"
      size="xl"
      testId="guest-service-add-trigger"
    />
  );
}
