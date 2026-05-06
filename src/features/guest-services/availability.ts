/**
 * V9F — pure availability helpers for the guest catalog.
 *
 * "Availability" here is conservative: a service is offered to a guest only
 * if the guest's stay window can still meet the lead-time + the catalog
 * row's date / quantity constraints. Real provider availability (chef,
 * driver fleets, etc.) is out-of-scope for v9F.
 */

import type { PricingModel } from "./pricing";

export interface AvailabilityCatalogRow {
  status: string;
  guestVisible: boolean;
  pricingModel: PricingModel;
  requiresDate: boolean;
  requiresGuestCount: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  leadTimeHours: number | null;
}

export interface StayWindow {
  /** Stay check-in midnight UTC. */
  checkInAt: Date | string;
  /** Stay check-out midnight UTC. */
  checkOutAt: Date | string;
}

export type AvailabilityReason =
  | "ok"
  | "service_paused"
  | "service_archived"
  | "not_guest_visible"
  | "lead_time_too_short"
  | "outside_stay_window";

export interface AvailabilityResult {
  available: boolean;
  reason: AvailabilityReason;
}

/**
 * Pure: is the catalog row offerable to a guest right now (considering
 * stay window + lead time)? `now` defaults to current time so tests can
 * inject fixed clocks.
 */
export function isServiceAvailableForStay(
  row: AvailabilityCatalogRow,
  stay: StayWindow,
  now: Date = new Date(),
): AvailabilityResult {
  if (row.status === "archived") {
    return { available: false, reason: "service_archived" };
  }
  if (row.status === "paused") {
    return { available: false, reason: "service_paused" };
  }
  if (!row.guestVisible) {
    return { available: false, reason: "not_guest_visible" };
  }

  const checkOut = +new Date(stay.checkOutAt);
  const nowMs = now.getTime();
  if (nowMs >= checkOut) {
    return { available: false, reason: "outside_stay_window" };
  }

  if (row.leadTimeHours && row.leadTimeHours > 0) {
    // Earliest fulfilment instant must still fit before checkout.
    const earliest = nowMs + row.leadTimeHours * 60 * 60 * 1000;
    if (earliest >= checkOut) {
      return { available: false, reason: "lead_time_too_short" };
    }
  }

  return { available: true, reason: "ok" };
}

export interface RequestedSlotInputs {
  pricingModel: PricingModel;
  requiresDate: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  leadTimeHours: number | null;
  requestedDate: string | null;
  requestedTime: string | null;
  quantity: number;
  guestCount: number | null;
  /** ISO date strings, inclusive. */
  stayCheckIn: string;
  stayCheckOut: string;
  now?: Date;
}

export type RequestedSlotIssue =
  | "missing_date"
  | "date_outside_stay"
  | "lead_time_violation"
  | "quantity_below_min"
  | "quantity_above_max"
  | "missing_guest_count";

/**
 * Pure: validate a guest's requested slot against the catalog row. Returns
 * a list of issues — empty array means the request is acceptable.
 */
export function validateRequestedSlot(
  input: RequestedSlotInputs,
): RequestedSlotIssue[] {
  const issues: RequestedSlotIssue[] = [];
  const now = input.now ?? new Date();

  if (input.requiresDate && !input.requestedDate) {
    issues.push("missing_date");
  }

  if (input.requestedDate) {
    const reqIso = `${input.requestedDate}T${input.requestedTime ?? "12:00"}:00.000Z`;
    const reqMs = +new Date(reqIso);
    const inMs = +new Date(`${input.stayCheckIn}T00:00:00.000Z`);
    const outMs = +new Date(`${input.stayCheckOut}T23:59:59.000Z`);
    if (reqMs < inMs || reqMs > outMs) {
      issues.push("date_outside_stay");
    }
    if (input.leadTimeHours && input.leadTimeHours > 0) {
      const earliest = now.getTime() + input.leadTimeHours * 60 * 60 * 1000;
      if (reqMs < earliest) {
        issues.push("lead_time_violation");
      }
    }
  }

  if (input.quantity < input.minQuantity) {
    issues.push("quantity_below_min");
  }
  if (input.maxQuantity !== null && input.quantity > input.maxQuantity) {
    issues.push("quantity_above_max");
  }

  if (input.pricingModel === "per_person" && !input.guestCount) {
    issues.push("missing_guest_count");
  }

  return issues;
}
