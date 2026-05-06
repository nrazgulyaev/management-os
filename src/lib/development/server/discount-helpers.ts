/**
 * Pure helpers for discount authorization.
 *
 * Given a proposer's role-key set and the project's seeded
 * `discountAuthorizations` table, decides:
 *   - whether the proposer can approve directly
 *   - whether the proposal must be escalated, and to whom
 */

import type {
  DiscountAuthorizationLimit,
  DiscountEvaluation,
} from "@/lib/development/types/discounts";

export interface EvaluateDiscountInput {
  proposerRoleKeys: string[];
  /** All authorization rows, for the resolver to consult. */
  authorizationLimits: DiscountAuthorizationLimit[];
  /** The discount being proposed, in absolute USD minor and percent. */
  discountPercent: number;
  discountAbsoluteUsdMinor: bigint;
}

/**
 * Evaluates whether the proposer can authorize this discount themselves.
 *
 * Algorithm:
 *   1. Find all active authorizations whose roleKey is in proposer's roles.
 *   2. The proposer's effective max is the MAX percent / MAX absolute across
 *      those rows (a person with two roles gets the higher limit).
 *   3. If the proposed discount is <= effective max, approve.
 *   4. Otherwise, find the lowest authorization the proposer is NOT in that
 *      can cover this discount, suggest escalating there.
 */
export function evaluateDiscountProposal(
  input: EvaluateDiscountInput,
): DiscountEvaluation {
  const active = input.authorizationLimits.filter((a) => a.isActive);
  const proposerRows = active.filter((a) =>
    input.proposerRoleKeys.includes(a.roleKey),
  );

  const proposerMaxPercent = proposerRows.reduce<number | null>((acc, r) => {
    if (r.maxPercentValue === null) return null; // unlimited beats anything
    return acc === null ? r.maxPercentValue : Math.max(acc, r.maxPercentValue);
  }, 0);
  const proposerMaxAbsolute = proposerRows.reduce<bigint | null>((acc, r) => {
    if (r.maxAbsoluteUsdMinor === null) return acc; // null means percent-only
    if (acc === null) return r.maxAbsoluteUsdMinor;
    return r.maxAbsoluteUsdMinor > acc ? r.maxAbsoluteUsdMinor : acc;
  }, null);

  const exceedsPercent =
    proposerMaxPercent !== null && input.discountPercent > proposerMaxPercent;
  const exceedsAbsolute =
    proposerMaxAbsolute !== null &&
    input.discountAbsoluteUsdMinor > proposerMaxAbsolute;

  if (!exceedsPercent && !exceedsAbsolute) {
    return {
      withinAuthority: true,
      needsEscalation: false,
      escalateToRoleKey: null,
      reason: proposerRows.length
        ? `Within proposer authority (max ${
            proposerMaxPercent === null ? "unlimited" : `${proposerMaxPercent}%`
          }).`
        : "Proposer has no explicit limit; defaulting to within-authority.",
    };
  }

  // Find escalation target: the lowest authorization the proposer is NOT in
  // that has enough headroom for this discount.
  const sorted = active
    .filter((a) => !input.proposerRoleKeys.includes(a.roleKey))
    .sort((a, b) => {
      const aMax = a.maxPercentValue ?? Number.POSITIVE_INFINITY;
      const bMax = b.maxPercentValue ?? Number.POSITIVE_INFINITY;
      return aMax - bMax;
    });
  const target = sorted.find((a) => {
    const okPct =
      a.maxPercentValue === null || input.discountPercent <= a.maxPercentValue;
    const okAbs =
      a.maxAbsoluteUsdMinor === null ||
      input.discountAbsoluteUsdMinor <= a.maxAbsoluteUsdMinor;
    return okPct && okAbs;
  });

  return {
    withinAuthority: false,
    needsEscalation: true,
    escalateToRoleKey: target?.roleKey ?? null,
    reason: target
      ? `Exceeds proposer max (${
          proposerMaxPercent === null ? "unlimited" : `${proposerMaxPercent}%`
        }); escalate to ${target.roleKey}.`
      : `Exceeds all configured tiers — manual review required.`,
  };
}
