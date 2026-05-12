"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { QaQcCreateForm } from "./qa-qc-create-form";

export function QaQcAddButton({
  projects,
  villas,
  categories,
}: {
  projects: Array<{ id: string; name: string }>;
  villas: Array<{ id: string; unitCode: string; projectId: string }>;
  categories: Array<{ id: string; displayName: string }>;
}) {
  return (
    <ModalFirstAddButton
      label="New issue"
      modalTitle="New QA/QC issue"
      formComponent={QaQcCreateForm}
      formProps={{ projects, villas, categories }}
      newRouteHref="/development-os/qa-qc/new"
      size="xl"
      testId="qa-qc-add-trigger"
    />
  );
}
