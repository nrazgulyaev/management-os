"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { SpecificationForm } from "./specification-form";

export function SpecificationAddButton() {
  return (
    <ModalFirstAddButton
      label="New specification"
      modalTitle="New specification"
      formComponent={SpecificationForm}
      formProps={{}}
      newRouteHref="/development-os/specifications/new"
      size="lg"
      testId="specification-add-trigger"
    />
  );
}
