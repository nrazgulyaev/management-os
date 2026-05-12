/**
 * Stage 10.6.B.4 — Modal-First Add for damage reports.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { DamageReportForm } from "./damage-form";

export function DamageAddButton({
  villas,
}: {
  villas: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Log damage"
      modalTitle="New damage report"
      modalDescription="Capture damage details, severity, and chargeability."
      formComponent={DamageReportForm}
      formProps={{
        villas,
        cancelHref: "/dashboard/operations/damage-reports",
      }}
      newRouteHref="/dashboard/operations/damage-reports/new"
      size="lg"
      testId="damage-add-trigger"
    />
  );
}
