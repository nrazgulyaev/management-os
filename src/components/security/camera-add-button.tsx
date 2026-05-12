"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CameraForm } from "./camera-form";

export function CameraAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New camera"
      modalTitle="New security camera"
      formComponent={CameraForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/security/cameras/new"
      size="xl"
      testId="security-camera-add-trigger"
    />
  );
}
