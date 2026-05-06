/**
 * Pure owner-stay policy helpers — blackout dates, peak-season rules,
 * applicable-policy resolution. No `server-only` import.
 *
 * Policies cascade: a villa-level policy beats a project-level policy.
 * Multiple project-level policies are unsupported in v9B; the service
 * layer surfaces only one row per villa.
 */

export type OperationalCostModel =
  | "none"
  | "actual_costs"
  | "fixed_per_stay"
  | "fixed_per_night";

export type CompensationModel =
  | "none"
  | "fixed_per_night"
  | "management_fee_on_expected_gross"
  | "percent_of_expected_gross";

export interface OwnerStayPolicyLike {
  id: string;
  projectId: string | null;
  villaId: string | null;
  freeNightsPerYear: number;
  freeNightsApplyToPeak: boolean;
  requiresApproval: boolean;
  allowDisplacingGuestBookings: boolean;
  relocationAllowed: boolean;
  operationalCostModel: string;
  fixedOperationalCostMinor: number | null;
  currency: string | null;
  compensationModel: string;
  compensationPercent: string | number | null;
  fixedCompensationMinor: number | null;
  blackoutDates: unknown;
  peakSeasonRules: unknown;
  status: string;
}

/** Return the policy with the highest specificity that is active and
 *  applies to the (villaId, projectId) pair. Villa wins over project. */
export function pickApplicablePolicy<P extends OwnerStayPolicyLike>(
  policies: P[],
  villaId: string,
  projectId: string | null,
): P | null {
  const active = policies.filter((p) => p.status === "active");
  const villaPolicy = active.find((p) => p.villaId === villaId);
  if (villaPolicy) return villaPolicy;
  if (projectId) {
    const projectPolicy = active.find(
      (p) => p.villaId == null && p.projectId === projectId,
    );
    if (projectPolicy) return projectPolicy;
  }
  // Fall back to a global active policy (project_id and villa_id both null).
  return active.find((p) => p.villaId == null && p.projectId == null) ?? null;
}

/**
 * `blackoutDates` is stored as `jsonb` — accept any of:
 *   - ["YYYY-MM-DD", ...]                         (list of single dates)
 *   - [{ "start": "...", "end": "..." }, ...]     (list of ranges, inclusive)
 *   - null / undefined                              (no blackout)
 *
 * Returns the subset of `nights` that are blacked out.
 */
export function blackoutNights(
  policy: { blackoutDates: unknown } | null,
  nights: string[],
): string[] {
  if (!policy?.blackoutDates) return [];
  const raw = policy.blackoutDates;
  if (!Array.isArray(raw)) return [];
  const blacks: string[] = [];
  for (const n of nights) {
    for (const entry of raw) {
      if (typeof entry === "string" && entry === n) {
        blacks.push(n);
        break;
      }
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { start?: string }).start === "string" &&
        typeof (entry as { end?: string }).end === "string"
      ) {
        const s = (entry as { start: string }).start;
        const e = (entry as { end: string }).end;
        if (n >= s && n <= e) {
          blacks.push(n);
          break;
        }
      }
    }
  }
  return blacks;
}

/**
 * `peakSeasonRules` is stored as `jsonb`. Accepted shape:
 *   { ranges: [{ start, end }] }  // inclusive
 * Returns the subset of `nights` that fall in any peak range.
 */
export function peakNights(
  policy: { peakSeasonRules: unknown } | null,
  nights: string[],
): string[] {
  if (!policy?.peakSeasonRules) return [];
  const raw = policy.peakSeasonRules as { ranges?: unknown };
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.ranges)) return [];
  const ranges = raw.ranges.filter(
    (r): r is { start: string; end: string } =>
      r != null &&
      typeof r === "object" &&
      typeof (r as { start?: string }).start === "string" &&
      typeof (r as { end?: string }).end === "string",
  );
  if (ranges.length === 0) return [];
  const peak: string[] = [];
  for (const n of nights) {
    if (ranges.some((r) => n >= r.start && n <= r.end)) peak.push(n);
  }
  return peak;
}

export interface AllowanceUsageResult {
  freeNightsPerYear: number;
  alreadyApplied: number;
  remaining: number;
}

export function calculateAllowanceUsage(
  policy: { freeNightsPerYear: number },
  alreadyAppliedThisYear: number,
): AllowanceUsageResult {
  const cap = Math.max(0, policy.freeNightsPerYear);
  const used = Math.min(cap, Math.max(0, alreadyAppliedThisYear));
  return {
    freeNightsPerYear: cap,
    alreadyApplied: used,
    remaining: Math.max(0, cap - used),
  };
}

/**
 * Pure helper used by the estimator: given total stay nights, the policy,
 * the already-applied count this year, and which nights are peak,
 * returns how many nights consume the allowance for THIS request.
 *
 * Default rule: free nights apply only to non-peak nights unless the
 * policy explicitly opts in via `freeNightsApplyToPeak`.
 */
export function applyFreeNights(input: {
  totalNights: number;
  peakNightCount: number;
  policy: {
    freeNightsPerYear: number;
    freeNightsApplyToPeak: boolean;
  };
  alreadyAppliedThisYear: number;
}): {
  allowanceNightsApplied: number;
  billableNights: number;
} {
  const remaining =
    Math.max(0, input.policy.freeNightsPerYear) -
    Math.min(
      Math.max(0, input.alreadyAppliedThisYear),
      Math.max(0, input.policy.freeNightsPerYear),
    );
  const eligibleNights = input.policy.freeNightsApplyToPeak
    ? input.totalNights
    : Math.max(0, input.totalNights - input.peakNightCount);
  const allowanceNightsApplied = Math.min(remaining, eligibleNights);
  const billableNights = Math.max(0, input.totalNights - allowanceNightsApplied);
  return { allowanceNightsApplied, billableNights };
}
