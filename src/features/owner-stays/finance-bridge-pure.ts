/**
 * Pure mapping helpers for the owner-stay → finance bridge. NO
 * `server-only` import — the DB-aware service in `finance-bridge.ts`
 * passes raw owner-stay request rows through these functions.
 *
 * Mapping decision (documented in ADR-0014):
 *
 *   compensation_amount_minor   → management_fee_lines
 *     Captures the management fee / pool compensation owed because the
 *     villa was used by the owner instead of generating rental revenue.
 *     Keeps owner-stay charges OUT of `revenue_lines` — owner stays do
 *     NOT count as rental revenue (hard product constraint).
 *
 *   operational_cost_amount_minor → expense_lines
 *     `expense_type='owner_stay_operational_cost'`,
 *     `allocation_scope='owner_direct'`,
 *     `owner_chargeable=true`. The owner pays the cost directly via
 *     the statement — it doesn't allocate against the rental pool.
 *
 * Status routing rules:
 *   - eligible only when status ∈ {approved, completed}.
 *   - total_owner_charge == 0  → skipped_no_charge.
 *   - target period closed/locked → skipped_locked_period.
 *   - already bridged earlier  → no-op (caller checks the unique link row).
 *
 * Effective date for the finance rows is the LAST night of the stay
 * (`requested_end - 1 day`) so the charge lands in the period the stay
 * actually finishes in. This is the convention used by the existing
 * material-usage finance bridge (v8 ADR-0008).
 */

export type FinanceBridgeStatus =
  | "pending"
  | "bridged"
  | "skipped_no_charge"
  | "skipped_locked_period"
  | "failed"
  | "reversed";

export interface OwnerStayFinanceInputs {
  requestId: string;
  ownerId: string;
  villaId: string;
  projectId: string | null;
  status: string; // owner_stay_requests.status
  /** Last night of the stay = requestedEnd - 1 day, ISO YYYY-MM-DD. */
  effectiveDate: string;
  estimatedManagementCompensationMinor: number;
  estimatedOperationalCostMinor: number;
  currency: string;
}

export interface BridgeAmounts {
  compensationMinor: number;
  operationalCostMinor: number;
  totalMinor: number;
  currency: string;
  hasChargeable: boolean;
}

export function calculateOwnerStayFinanceAmounts(
  input: OwnerStayFinanceInputs,
): BridgeAmounts {
  const compensation = Math.max(0, input.estimatedManagementCompensationMinor);
  const operationalCost = Math.max(0, input.estimatedOperationalCostMinor);
  const total = compensation + operationalCost;
  return {
    compensationMinor: compensation,
    operationalCostMinor: operationalCost,
    totalMinor: total,
    currency: input.currency,
    hasChargeable: total > 0,
  };
}

/** Pure: should this owner-stay request be considered for the bridge? */
export function isBridgeEligibleStatus(status: string): boolean {
  return status === "approved" || status === "completed";
}

/**
 * Pure: convert a YYYY-MM-DD `requestedEnd` (exclusive checkout) to the
 * effective date for finance-row posting (last *night* of the stay).
 * `requestedEnd - 1 day`. Returns the input unchanged when parsing
 * fails — the caller validates Zod-side before reaching us.
 */
export function effectiveDateForRequest(
  requestedEnd: string,
): string {
  const d = new Date(`${requestedEnd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return requestedEnd;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure: pick the statement period whose `[period_start, period_end]`
 * inclusive range contains `effectiveDate`. Returns null when no period
 * matches; caller may then create a row with `statement_period_id=null`.
 */
export interface StatementPeriodLike {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
}

export function findStatementPeriodForDate(
  periods: StatementPeriodLike[],
  effectiveDate: string,
): StatementPeriodLike | null {
  for (const p of periods) {
    if (
      effectiveDate >= p.periodStart &&
      effectiveDate <= p.periodEnd
    ) {
      return p;
    }
  }
  return null;
}

export function isPeriodLocked(period: StatementPeriodLike | null): boolean {
  if (!period) return false;
  return period.status === "closed" || period.status === "locked";
}

/**
 * The full pure decision for one request: given the inputs + the period
 * lookup, return the bridge status that should be persisted (without
 * actually writing finance rows). The DB-aware service consumes this to
 * route writes vs. skips.
 */
export type BridgeDecision =
  | { status: "bridged"; amounts: BridgeAmounts; period: StatementPeriodLike | null }
  | { status: "skipped_no_charge"; amounts: BridgeAmounts; reason: string }
  | {
      status: "skipped_locked_period";
      amounts: BridgeAmounts;
      reason: string;
      period: StatementPeriodLike;
    }
  | { status: "failed"; amounts: BridgeAmounts; reason: string };

export function decideBridge(
  input: OwnerStayFinanceInputs,
  candidatePeriods: StatementPeriodLike[],
): BridgeDecision {
  if (!isBridgeEligibleStatus(input.status)) {
    return {
      status: "failed",
      amounts: calculateOwnerStayFinanceAmounts(input),
      reason: `request status '${input.status}' is not bridge-eligible`,
    };
  }
  const amounts = calculateOwnerStayFinanceAmounts(input);
  if (!amounts.hasChargeable) {
    return {
      status: "skipped_no_charge",
      amounts,
      reason: "request has no chargeable amount",
    };
  }
  const period = findStatementPeriodForDate(candidatePeriods, input.effectiveDate);
  if (isPeriodLocked(period)) {
    return {
      status: "skipped_locked_period",
      amounts,
      reason: `target statement period (${period!.periodStart}…${period!.periodEnd}) is ${period!.status}`,
      period: period!,
    };
  }
  return { status: "bridged", amounts, period };
}
