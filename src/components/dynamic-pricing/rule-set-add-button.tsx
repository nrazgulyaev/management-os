"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CreateRuleSetForm } from "./create-rule-set-form";

export function RuleSetAddButton() {
  return (
    <ModalFirstAddButton
      label="New rule set"
      modalTitle="New pricing rule set"
      modalDescription="Pick a scope (global / project / villa) and a base rate. Add modifier rules from the detail page after creation."
      formComponent={CreateRuleSetForm}
      formProps={{}}
      newRouteHref="/dashboard/pricing/rule-sets/new"
      size="lg"
      testId="rule-set-add-trigger"
    />
  );
}
