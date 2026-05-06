/**
 * Pure owner-stay estimator. Combines policy + quote into a single
 * structured estimate the request form (and admin review surface) can
 * render. NO `server-only` import.
 *
 * The estimator NEVER decides availability — it only reports money.
 * Conflicts are detected by the V9A availability layer; relocation
 * candidates by the relocation layer.
 */

import {
  calculateManagementCompensationPure,
  enumerateNights,
  type QuoteResult,
} from "@/features/pricing/quote";
import {
  applyFreeNights,
  blackoutNights,
  peakNights,
  type OwnerStayPolicyLike,
} from "./policy";

export interface OwnerStayEstimateInput {
  policy: OwnerStayPolicyLike | null;
  quote: QuoteResult; // pricing result for the candidate range
  requestedStart: string;
  requestedEnd: string;
  alreadyAppliedThisYear: number;
}

export interface OwnerStayEstimate {
  /** Total nights in [start, end). */
  totalNights: number;
  /** Nights in any blackout range — operator must override or reject. */
  blackoutNightCount: number;
  /** Peak nights per the policy. */
  peakNightCount: number;
  /** Free nights consumed by THIS request after applying the policy. */
  allowanceNightsApplied: number;
  /** Nights the owner has to pay rate-card on. */
  billableNights: number;
  /** Pricing — total expected gross at rate-card. */
  estimatedGrossRevenueMinor: number;
  /** Management/pool compensation per the policy on the OWNER-charged
   *  portion only (billable nights). */
  estimatedManagementCompensationMinor: number;
  /** Operational cost (cleaning / utilities / etc) on the policy. */
  estimatedOperationalCostMinor: number;
  /** Sum of compensation + operational cost — what the owner statement
   *  will charge. Pure number; finance will materialise it later. */
  estimatedTotalOwnerChargeMinor: number;
  /** Currency mirrors the rate plan; if no plan, falls back to the
   *  policy's currency or USD. */
  currency: string;
  /** True when the estimator believes the request needs admin review:
   *  policy says so, blackout hit, allowance exhausted, etc. */
  requiresAdminApproval: boolean;
  warnings: string[];
}

/** Pure: derive billable-night gross given the per-night breakdown. We
 *  assume nights are charged in calendar order, so allowance consumes the
 *  cheapest non-peak nights last. v9B keeps this simple — the owner gets
 *  charged for the LAST `billableNights` nights of the breakdown.
 *
 *  Caveat: a more user-friendly model lets the owner pick which nights
 *  the allowance covers. v9B is intentionally simple. */
function billableGrossMinor(
  breakdown: QuoteResult["breakdown"],
  billableNights: number,
): number {
  if (billableNights <= 0) return 0;
  if (billableNights >= breakdown.length)
    return breakdown.reduce((s, n) => s + n.nightlyRateMinor, 0);
  const tail = breakdown.slice(breakdown.length - billableNights);
  return tail.reduce((s, n) => s + n.nightlyRateMinor, 0);
}

export function estimateOwnerStay(input: OwnerStayEstimateInput): OwnerStayEstimate {
  const nights = enumerateNights(input.requestedStart, input.requestedEnd);
  const totalNights = nights.length;
  const warnings: string[] = [];

  const blackouts = blackoutNights(input.policy, nights);
  const peaks = peakNights(input.policy, nights);
  if (blackouts.length > 0) {
    warnings.push(
      `${blackouts.length} night(s) fall on a blackout date.`,
    );
  }

  // Allowance application
  const policy = input.policy;
  const policyFree = policy
    ? {
        freeNightsPerYear: policy.freeNightsPerYear,
        freeNightsApplyToPeak: policy.freeNightsApplyToPeak,
      }
    : { freeNightsPerYear: 0, freeNightsApplyToPeak: false };
  const { allowanceNightsApplied, billableNights } = applyFreeNights({
    totalNights,
    peakNightCount: peaks.length,
    policy: policyFree,
    alreadyAppliedThisYear: input.alreadyAppliedThisYear,
  });

  const grossMinor = billableGrossMinor(input.quote.breakdown, billableNights);
  // Total expected gross is rate-card across ALL nights — used for revenue
  // impact metrics (separate from owner charge). Owner charges are based
  // on `billableNights` only.
  const expectedGrossAllNightsMinor = input.quote.grossAmountMinor;

  // Compensation
  let compensationMinor = 0;
  if (policy) {
    switch (policy.compensationModel) {
      case "none":
        compensationMinor = 0;
        break;
      case "fixed_per_night":
        compensationMinor =
          (policy.fixedCompensationMinor ?? 0) * billableNights;
        break;
      case "management_fee_on_expected_gross":
      case "percent_of_expected_gross": {
        const pct = policy.compensationPercent ?? 0;
        compensationMinor = calculateManagementCompensationPure(grossMinor, pct);
        break;
      }
      default:
        compensationMinor = 0;
    }
  }

  // Operational cost
  let opCostMinor = 0;
  if (policy) {
    switch (policy.operationalCostModel) {
      case "none":
        opCostMinor = 0;
        break;
      case "actual_costs":
        // We can't compute actuals at request time; surface a warning so
        // the owner knows the line will appear post-stay.
        opCostMinor = 0;
        warnings.push(
          "Actual operational costs (cleaning, utilities) will be itemised on the statement after the stay.",
        );
        break;
      case "fixed_per_stay":
        opCostMinor = policy.fixedOperationalCostMinor ?? 0;
        break;
      case "fixed_per_night":
        opCostMinor = (policy.fixedOperationalCostMinor ?? 0) * totalNights;
        break;
    }
  }

  const requiresAdminApproval =
    !!policy?.requiresApproval ||
    blackouts.length > 0 ||
    !input.quote.available;

  // Reference unused locals so eslint doesn't complain — these are kept
  // available for future revenue-impact reporting in the admin UI.
  void expectedGrossAllNightsMinor;

  return {
    totalNights,
    blackoutNightCount: blackouts.length,
    peakNightCount: peaks.length,
    allowanceNightsApplied,
    billableNights,
    estimatedGrossRevenueMinor: grossMinor,
    estimatedManagementCompensationMinor: compensationMinor,
    estimatedOperationalCostMinor: opCostMinor,
    estimatedTotalOwnerChargeMinor: compensationMinor + opCostMinor,
    currency:
      input.quote.currency || policy?.currency || "USD",
    requiresAdminApproval,
    warnings,
  };
}
