/**
 * Pure constants for investor-portal write requests (withdrawal / reinvest /
 * transfer). No server imports — safe to use from client components and from
 * server pages alike. Mirrors the status + type literals defined on the
 * `investor_portal_requests` table.
 */

export const PORTAL_REQUEST_TYPES = [
  "withdrawal",
  "reinvest_to_project",
  "transfer_between_projects",
  "capital_call_response",
] as const;
export type PortalRequestType = (typeof PORTAL_REQUEST_TYPES)[number];

export const PORTAL_REQUEST_TYPE_LABEL: Record<PortalRequestType, string> = {
  withdrawal: "Withdrawal",
  reinvest_to_project: "Reinvest",
  transfer_between_projects: "Transfer",
  capital_call_response: "Capital call response",
};

export const PORTAL_REQUEST_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "executed",
  "rejected",
  "cancelled",
] as const;
export type PortalRequestStatus = (typeof PORTAL_REQUEST_STATUSES)[number];

export const PORTAL_REQUEST_STATUS_LABEL: Record<PortalRequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  executed: "Executed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Badge tone for each lifecycle state — matches @/components/ui/badge tones. */
export const PORTAL_REQUEST_STATUS_TONE: Record<
  PortalRequestStatus,
  "neutral" | "info" | "accent" | "success" | "danger" | "warning"
> = {
  submitted: "info",
  under_review: "accent",
  approved: "warning",
  executed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/**
 * The LP-visible lifecycle, in order. Used to render a stepper on the
 * requests surface. `rejected` / `cancelled` are terminal off-ramps that
 * sit outside the happy path.
 */
export const PORTAL_REQUEST_LIFECYCLE: readonly PortalRequestStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "executed",
] as const;

/** Statuses an LP may still cancel from (pre-execution). */
export const PORTAL_REQUEST_CANCELLABLE: ReadonlySet<PortalRequestStatus> =
  new Set(["submitted", "under_review"]);

/**
 * 0-indexed position of a status in the happy-path lifecycle, or -1 for the
 * terminal off-ramps (rejected/cancelled).
 */
export function portalRequestLifecycleIndex(status: string): number {
  return PORTAL_REQUEST_LIFECYCLE.indexOf(status as PortalRequestStatus);
}
