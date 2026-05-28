/**
 * Phase 2.4 mgmt-04 — comp-policy-checker agent (stub).
 *
 * Pre-checks any comp proposal (from the agent or from staff)
 * against the comp policy. Wraps the pure checkCompPolicy() so the
 * agent runtime can stop a ≥ 500_000 IDR auto-comp before it
 * persists.
 */

import { checkCompPolicy, type CompPolicyOutcome } from "@/features/concierge/comp-policy";

export interface CompPolicyCheckerInput {
  organizationId: string;
  bookingId: string;
  amountIdr: number;
  reason: string;
  recentCompTotalIdr: number;
}

export interface CompPolicyCheckerOutput {
  outcome: CompPolicyOutcome;
}

export async function check(input: CompPolicyCheckerInput): Promise<CompPolicyCheckerOutput> {
  return {
    outcome: checkCompPolicy({
      amountIdr: input.amountIdr,
      reasonProvided: input.reason.trim().length > 0,
      recentCompTotalIdr: input.recentCompTotalIdr,
    }),
  };
}

export const COMP_POLICY_CHECKER_AGENT = {
  agentCode: "comp-policy-checker",
  description: "Gates comp proposals; ≥ 500_000 IDR requires staff approval (UX rule 2).",
} as const;
