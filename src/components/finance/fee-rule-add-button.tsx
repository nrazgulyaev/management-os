"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { FeeRuleForm, type FeeRuleFormOption } from "@/components/finance/fee-rule-form";

export function FeeRuleAddButton({
  projects,
  villas,
}: {
  projects: FeeRuleFormOption[];
  villas: FeeRuleFormOption[];
}) {
  return (
    <ModalFirstAddButton
      label="New fee rule"
      modalTitle="New management fee rule"
      formComponent={FeeRuleForm}
      formProps={{ projects, villas }}
      size="lg"
      testId="fee-rule-add-trigger"
    />
  );
}
