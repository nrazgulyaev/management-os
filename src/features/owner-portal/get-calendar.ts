/**
 * Phase 2.3 owner-04 — getOwnerCalendar.
 *
 * Server fn that resolves the data behind /owner/calendar:
 *   month            — "YYYY-MM" being viewed
 *   events           — color-encoded multi-day events for the month
 *   pipeline         — simplified next-30d booking list
 *   villas           — picker options for the personal-stay modal
 *
 * Today the function returns an empty event set + empty pipeline;
 * the data PR wires bookings + owner_stay_requests joins.
 */

import "server-only";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";
import type { CalendarEvent } from "@/components/owner-portal/month-calendar";
import type { PipelineBooking } from "@/components/owner-portal/pipeline-list";

export interface OwnerCalendarResult {
  month: string;
  events: CalendarEvent[];
  pipeline: PipelineBooking[];
  villas: { id: string; label: string }[];
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getOwnerCalendar(
  ownerId: string,
  month?: string,
): Promise<OwnerCalendarResult> {
  const owned = await listMyVillas(ownerId).catch(() => []);
  return {
    month: month ?? currentMonth(),
    events: [],
    pipeline: [],
    villas: owned.map((v) => ({
      id: v.villaId,
      label: v.villaCode ?? v.villaName ?? "Villa",
    })),
  };
}
