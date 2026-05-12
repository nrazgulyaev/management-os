/**
 * Stage 10.6.B.4 — Modal-First Add for finance/revenue.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { RevenueLineForm } from "@/app/(dashboard)/dashboard/finance/revenue/new/form";

export function RevenueAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="New revenue"
      modalTitle="New revenue line"
      formComponent={RevenueLineForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/finance/revenue/new"
      size="xl"
      testId="revenue-add-trigger"
    />
  );
}
