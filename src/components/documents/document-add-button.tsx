"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { DocumentForm } from "@/app/(dashboard)/dashboard/documents/new/form";

export function DocumentAddButton() {
  return (
    <ModalFirstAddButton
      label="New document"
      modalTitle="New document"
      modalDescription="Records metadata only. Storage bucket / path are optional placeholders until file upload lands in v3."
      formComponent={DocumentForm}
      formProps={{}}
      newRouteHref="/dashboard/documents/new"
      size="xl"
      testId="document-add-trigger"
    />
  );
}
