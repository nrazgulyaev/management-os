/**
 * Phase 2.4 mgmt-04 — Comp policy.
 *
 * Critical UX rule 2: comp ≥ IDR 500_000 requires staff approval.
 * Below the threshold, auto-approve and log to comp_offered.
 *
 * Pure function so the modal + the agent share the same gate.
 */

export const COMP_APPROVAL_THRESHOLD_IDR = 500_000;

export type CompPolicyOutcome =
  | { allowed: true; autoApproved: true }
  | { allowed: true; autoApproved: false; requiresApprovalBy: "staff" | "director" }
  | { allowed: false; reason: string };

export interface CompPolicyInput {
  amountIdr: number;
  reasonProvided: boolean;
  /** Past 7d total for this booking, before this proposal. */
  recentCompTotalIdr: number;
}

export function checkCompPolicy(input: CompPolicyInput): CompPolicyOutcome {
  if (!input.reasonProvided) {
    return { allowed: false, reason: "Reason is required for any comp." };
  }
  if (input.amountIdr < 0) {
    return { allowed: false, reason: "Negative comp is not allowed." };
  }

  // Stack limit: > 2M IDR / 7d per booking always needs director.
  if (input.recentCompTotalIdr + input.amountIdr > 2_000_000) {
    return { allowed: true, autoApproved: false, requiresApprovalBy: "director" };
  }
  if (input.amountIdr >= COMP_APPROVAL_THRESHOLD_IDR) {
    return { allowed: true, autoApproved: false, requiresApprovalBy: "staff" };
  }
  return { allowed: true, autoApproved: true };
}
