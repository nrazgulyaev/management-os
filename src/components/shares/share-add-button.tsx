"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { ShareForm } from "@/app/(dashboard)/dashboard/shares/new/form";

export function ShareAddButton({
  owners,
  projects,
  villas,
}: {
  owners: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  villas: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New share"
      modalTitle="New ownership share"
      modalDescription="Active shares for the same villa or pool must total exactly 100%."
      formComponent={ShareForm}
      formProps={{ owners, projects, villas }}
      newRouteHref="/dashboard/shares/new"
      size="xl"
      testId="share-add-trigger"
    />
  );
}
