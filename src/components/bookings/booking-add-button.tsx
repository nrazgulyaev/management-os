/**
 * Stage 10.6.B.4 — Modal-First Add for bookings.
 *
 * Replaces the legacy `<Link href="/dashboard/bookings/new">New booking</Link>`
 * triggers on `/dashboard/bookings` + `/dashboard/bookings/calendar` with
 * an inline modal.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { BookingForm } from "@/features/bookings/form";

export function BookingAddButton({
  villas,
  channels,
  guests,
  label = "New booking",
}: {
  villas: { id: string; label: string }[];
  channels: { id: string; label: string; key: string }[];
  guests: { id: string; label: string }[];
  label?: string;
}) {
  return (
    <ModalFirstAddButton
      label={label}
      variant="accent"
      modalTitle="New manual booking"
      modalDescription="Record a booking that arrived outside an OTA — direct, agent referral, or in-person request. Fees follow the channel default; override per booking when needed."
      formComponent={BookingForm}
      formProps={{
        mode: "create" as const,
        villas,
        channels,
        guests,
      }}
      newRouteHref="/dashboard/bookings/new"
      size="xl"
      testId="booking-add-trigger"
    />
  );
}
