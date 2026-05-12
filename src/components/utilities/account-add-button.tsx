"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { UtilityAccountForm } from "./account-form";

export function UtilityAccountAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New account"
      modalTitle="New utility account"
      formComponent={UtilityAccountForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/utilities/accounts/new"
      size="xl"
      testId="utility-account-add-trigger"
    />
  );
}
