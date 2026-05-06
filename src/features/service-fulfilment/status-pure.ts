/**
 * Pure helpers for guest-service fulfilment status — the single
 * source of truth for which transitions are allowed and what each
 * status means to the guest, the vendor, and the admin. No DB / no
 * `server-only` import.
 */

export type FulfilmentStatus =
  | "new"
  | "triage"
  | "awaiting_vendor"
  | "vendor_confirmed"
  | "guest_confirmed"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed"
  | "no_show";

export const TERMINAL_STATUSES: FulfilmentStatus[] = [
  "completed",
  "cancelled",
  "failed",
  "no_show",
];

/**
 * Allowed forward transitions. Reverse / sideways transitions are
 * deliberately conservative — operators with override rights can
 * still patch a row through the admin "set status" flow, but the
 * runner-driven transitions stay on these rails.
 */
export const SERVICE_FULFILMENT_TRANSITIONS: Record<
  FulfilmentStatus,
  FulfilmentStatus[]
> = {
  new: ["triage", "awaiting_vendor", "scheduled", "cancelled"],
  triage: ["awaiting_vendor", "scheduled", "cancelled"],
  awaiting_vendor: [
    "vendor_confirmed",
    "scheduled",
    "cancelled",
    "failed",
  ],
  vendor_confirmed: [
    "guest_confirmed",
    "scheduled",
    "cancelled",
    "failed",
  ],
  guest_confirmed: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "completed", "cancelled", "no_show", "failed"],
  in_progress: ["completed", "failed"],
  completed: [],
  cancelled: [],
  failed: [],
  no_show: [],
};

export function canTransitionFulfilmentStatus(
  from: FulfilmentStatus,
  to: FulfilmentStatus,
): boolean {
  if (from === to) return true;
  const allowed = SERVICE_FULFILMENT_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function isTerminalFulfilmentStatus(
  status: FulfilmentStatus,
): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Vendor work is required when the order is routed externally.
 * `internal` fulfilments never enter awaiting_vendor; the runner
 * should skip the vendor-confirmation steps for them.
 */
export function requiresVendor(
  fulfilmentType: "internal" | "vendor" | "hybrid",
): boolean {
  return fulfilmentType === "vendor" || fulfilmentType === "hybrid";
}

/**
 * Pure: collapse internal status to a guest-friendly label. Internal
 * triage / awaiting_vendor never leak to the guest — they all show as
 * "Pending confirmation".
 */
export function guestFacingFulfilmentStatus(
  status: FulfilmentStatus,
): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
} {
  switch (status) {
    case "new":
    case "triage":
    case "awaiting_vendor":
    case "vendor_confirmed":
      return { label: "Pending confirmation", tone: "neutral" };
    case "guest_confirmed":
      return { label: "Confirmed", tone: "info" };
    case "scheduled":
      return { label: "Scheduled", tone: "info" };
    case "in_progress":
      return { label: "In progress", tone: "info" };
    case "completed":
      return { label: "Completed", tone: "success" };
    case "cancelled":
      return { label: "Cancelled", tone: "warning" };
    case "no_show":
      return { label: "Missed", tone: "warning" };
    case "failed":
      return { label: "Could not deliver", tone: "danger" };
  }
}

/**
 * Pure: vendor-side label. Vendors see slightly different wording —
 * they need to know when *we* are blocking on them.
 */
export function vendorFacingFulfilmentStatus(
  status: FulfilmentStatus,
): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
  /** When true, the vendor is blocking us. */
  awaitingVendor: boolean;
} {
  switch (status) {
    case "new":
      return { label: "New request", tone: "neutral", awaitingVendor: false };
    case "triage":
      return {
        label: "Concierge reviewing",
        tone: "neutral",
        awaitingVendor: false,
      };
    case "awaiting_vendor":
      return {
        label: "Awaiting your confirmation",
        tone: "warning",
        awaitingVendor: true,
      };
    case "vendor_confirmed":
      return { label: "Confirmed", tone: "info", awaitingVendor: false };
    case "guest_confirmed":
      return {
        label: "Confirmed by guest",
        tone: "info",
        awaitingVendor: false,
      };
    case "scheduled":
      return { label: "Scheduled", tone: "info", awaitingVendor: false };
    case "in_progress":
      return { label: "In progress", tone: "info", awaitingVendor: false };
    case "completed":
      return { label: "Completed", tone: "success", awaitingVendor: false };
    case "cancelled":
      return {
        label: "Cancelled",
        tone: "warning",
        awaitingVendor: false,
      };
    case "no_show":
      return { label: "No show", tone: "warning", awaitingVendor: false };
    case "failed":
      return { label: "Failed", tone: "danger", awaitingVendor: false };
  }
}

/** Pure: only completed fulfilments can be rated by the guest. */
export function canGuestRate(status: FulfilmentStatus): boolean {
  return status === "completed";
}
