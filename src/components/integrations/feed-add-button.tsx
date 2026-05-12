/**
 * Stage 10.6.B.4 — Modal-First Add for calendar feeds.
 *
 * Used on both /dashboard/bookings/sync and /dashboard/integrations/calendar-feeds.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { CalendarFeedForm } from "./feed-form";

export function CalendarFeedAddButton({
  villas,
  channels,
  cancelHref,
  label = "Add feed",
}: {
  villas: { id: string; label: string }[];
  channels: { id: string; label: string }[];
  cancelHref: string;
  label?: string;
}) {
  return (
    <ModalFirstAddButton
      label={label}
      modalTitle="Add a calendar feed"
      modalDescription="iCal/ICS URL from Airbnb, Booking.com, Vrbo, or any external calendar."
      formComponent={CalendarFeedForm}
      formProps={{ villas, channels, cancelHref }}
      newRouteHref="/dashboard/integrations/calendar-feeds/new"
      size="lg"
      testId="calendar-feed-add-trigger"
    />
  );
}
