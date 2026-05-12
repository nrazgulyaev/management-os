/**
 * Stage 10.6.B.4 — Modal-First Add for finance/statements.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { GenerateStatementForm } from "@/app/(dashboard)/dashboard/finance/statements/new/form";

export function StatementAddButton({
  owners,
  villas,
  projects,
  periods,
}: {
  owners: { id: string; label: string }[];
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  periods: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Generate statement"
      modalTitle="Generate owner statement"
      modalDescription="Pick the owner + period. Optional villa / project filters constrain the scope."
      formComponent={GenerateStatementForm}
      formProps={{ owners, villas, projects, periods }}
      newRouteHref="/dashboard/finance/statements/new"
      size="lg"
      testId="statement-add-trigger"
    />
  );
}
