/**
 * V9F — pure status-machine helpers for guest service orders.
 *
 * Lifecycle:
 *   requested → reviewing → confirmed → scheduled → fulfilled
 *                                              ↘  cancelled
 *                                              ↘  rejected
 *
 * `cancelled` and `rejected` are absorbing terminal states. `fulfilled` is
 * also terminal. The bridge to revenue_lines is only allowed once the
 * order is `fulfilled`.
 */

export type OrderStatus =
  | "requested"
  | "reviewing"
  | "confirmed"
  | "scheduled"
  | "fulfilled"
  | "cancelled"
  | "rejected";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  requested: "Requested",
  reviewing: "Reviewing",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  requested: ["reviewing", "confirmed", "scheduled", "cancelled", "rejected"],
  reviewing: ["confirmed", "scheduled", "cancelled", "rejected"],
  confirmed: ["scheduled", "fulfilled", "cancelled"],
  scheduled: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
  rejected: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function nextAllowedStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function isTerminalStatus(s: OrderStatus): boolean {
  return s === "fulfilled" || s === "cancelled" || s === "rejected";
}

/**
 * Pure: should the finance bridge fire for this status transition? We
 * bridge once on entering `fulfilled` and treat any non-fulfilled state
 * as no-charge from the bridge's perspective.
 */
export function shouldFinanceBridge(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return to === "fulfilled" && from !== "fulfilled";
}

/**
 * Pure: tone token for status badge. Renderers can map to design system
 * colors. Kept here so admin + guest views share the same vocabulary.
 */
export function toneForStatus(
  s: OrderStatus,
): "neutral" | "info" | "warning" | "success" | "danger" {
  switch (s) {
    case "requested":
    case "reviewing":
      return "info";
    case "confirmed":
    case "scheduled":
      return "warning";
    case "fulfilled":
      return "success";
    case "cancelled":
    case "rejected":
      return "danger";
  }
}
