/**
 * Pure status-transition table for `checkin_checkout_requests.status`.
 * No `server-only` import so the test suite + the action-layer guard
 * can both import directly.
 */

export const REQUEST_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  requested: ["reviewing", "approved", "rejected", "cancelled"],
  reviewing: ["approved", "rejected", "cancelled"],
  approved: ["completed", "cancelled"],
  rejected: [],
  cancelled: [],
  completed: [],
};

export function canTransitionRequestStatus(
  from: string,
  to: string,
): boolean {
  return (REQUEST_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
