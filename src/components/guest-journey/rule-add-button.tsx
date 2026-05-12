"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CreateGuestJourneyRuleForm } from "./create-rule-form";

export function GuestJourneyRuleAddButton() {
  return (
    <ModalFirstAddButton
      label="New rule"
      modalTitle="New guest-journey rule"
      modalDescription="Choose stage + anchor + offset. The runner will materialise one (booking, rule) row per active booking and dispatch when scheduled_for arrives."
      formComponent={CreateGuestJourneyRuleForm}
      formProps={{}}
      newRouteHref="/dashboard/guest-journey/rules/new"
      size="lg"
      testId="guest-journey-rule-add-trigger"
    />
  );
}
