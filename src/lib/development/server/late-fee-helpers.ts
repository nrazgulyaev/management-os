/**
 * Pure helper for daily late-fee accrual math.
 *
 * Returns the per-day fee in USD minor for a milestone given the project's
 * late fee rule and the number of days overdue at that point.
 */

import type {
  LateFeeRuleData,
  LateFeeType,
} from "@/lib/development/types/payments";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface AccrualInput {
  expectedAmountUsdMinor: bigint;
  expectedDueDate: Date;
  asOf: Date;
  rule: LateFeeRuleData;
  /** Cumulative late fee already accrued, used to enforce maxFee cap. */
  alreadyAccruedUsdMinor?: bigint;
}

export interface AccrualResult {
  daysOverdue: number;
  /** Fee for the current day (today's accrual). */
  todayFeeUsdMinor: bigint;
  /** Total fee that should be on the milestone given days overdue. */
  totalFeeUsdMinor: bigint;
  hitCap: boolean;
  reason: string;
}

export function computeAccrualForDay(input: AccrualInput): AccrualResult {
  const days =
    Math.floor((input.asOf.getTime() - input.expectedDueDate.getTime()) / MS_PER_DAY) -
    input.rule.gracePeriodDays;
  if (days <= 0) {
    return {
      daysOverdue: 0,
      todayFeeUsdMinor: 0n,
      totalFeeUsdMinor: input.alreadyAccruedUsdMinor ?? 0n,
      hitCap: false,
      reason: "within grace period",
    };
  }
  const total = totalForDays(input.expectedAmountUsdMinor, days, input.rule);
  let capped = total;
  let hitCap = false;
  if (input.rule.maxFeeUsdMinor !== null && total > input.rule.maxFeeUsdMinor) {
    capped = input.rule.maxFeeUsdMinor;
    hitCap = true;
  }
  const previous = input.alreadyAccruedUsdMinor ?? 0n;
  const todays = capped > previous ? capped - previous : 0n;
  return {
    daysOverdue: days,
    todayFeeUsdMinor: todays,
    totalFeeUsdMinor: capped,
    hitCap,
    reason: `${input.rule.feeType} · ${days} day${days === 1 ? "" : "s"} overdue${hitCap ? " · capped" : ""}`,
  };
}

function totalForDays(
  amount: bigint,
  days: number,
  rule: LateFeeRuleData,
): bigint {
  switch (rule.feeType as LateFeeType) {
    case "flat_fee":
      return BigInt(Math.round(rule.feeValue * 100));
    case "percent_per_day": {
      const perDayFactor = rule.feeValue / 100;
      return BigInt(Math.round(Number(amount) * perDayFactor * days));
    }
    case "percent_per_month": {
      const months = days / 30;
      const factor = (rule.feeValue / 100) * months;
      return BigInt(Math.round(Number(amount) * factor));
    }
    case "tiered":
      // Tier curve is admin-configured separately in v3; for 2.2.B the
      // tiered type is reserved and treated as a single flat fee per day.
      return BigInt(Math.round(rule.feeValue * 100 * days));
    default:
      return 0n;
  }
}
