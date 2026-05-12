"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CalendarBlockForm } from "./calendar-block-form";

export function CalendarBlockAddButton({
  villas,
  label = "New block",
}: {
  villas: { id: string; label: string }[];
  label?: string;
}) {
  return (
    <ModalFirstAddButton
      label={label}
      modalTitle="New calendar block"
      modalDescription="Manual blocks for maintenance, deep clean, OOO, internal hold, or owner-stay placeholder."
      formComponent={CalendarBlockForm}
      formProps={{ villas }}
      newRouteHref="/dashboard/availability/blocks/new"
      size="xl"
      testId="calendar-block-add-trigger"
    />
  );
}
