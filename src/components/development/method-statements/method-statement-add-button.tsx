"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { MethodStatementForm } from "./method-statement-form";

export function MethodStatementAddButton() {
  return (
    <ModalFirstAddButton
      label="New method"
      modalTitle="New method statement / SOP"
      formComponent={MethodStatementForm}
      formProps={{}}
      newRouteHref="/development-os/method-statements/new"
      size="xl"
      testId="method-statement-add-trigger"
    />
  );
}
