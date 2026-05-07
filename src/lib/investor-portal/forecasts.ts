/**
 * Stage 6.P7 — Investor distribution forecasts.
 *
 * Pure computation module. Given a commitment's profit-share + the
 * project's projected revenue + cost trajectory (or — for the
 * minimum surface — the rolling-average distribution amount over the
 * last N completed distributions), project upcoming distributions by
 * quarter for a configurable horizon.
 *
 * Pure helpers — no DB, no `import "server-only"` — testable.
 */

export interface CompletedDistribution {
  /** Period the distribution covered. */
  effectiveDate: Date;
  /** Investor's share of this distribution in USD minor units. */
  investorShareMinor: bigint;
}

export interface ForecastInput {
  /**
   * Completed distributions for the commitment, sorted ascending or
   * unsorted — the helper sorts internally. At least 2 are required
   * to compute a non-zero forecast.
   */
  completedDistributions: CompletedDistribution[];
  /**
   * How many future quarters to project. Default 4 (one year out).
   */
  horizonQuarters?: number;
  /**
   * Confidence trim — drop the highest + lowest distribution before
   * averaging when there are at least 4 completed. Default true.
   */
  trimOutliers?: boolean;
  /** Reference "today" for the forecast; defaults to system clock. */
  asOf?: Date;
}

export interface ForecastedQuarter {
  /** Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec */
  quarter: 1 | 2 | 3 | 4;
  year: number;
  /** Projected USD minor units. 0n if input was insufficient. */
  projectedAmountMinor: bigint;
  /** "low_confidence" when fewer than 2 completed distributions. */
  confidence: "low_confidence" | "rolling_average" | "trimmed_average";
}

export interface ForecastResult {
  quarters: ForecastedQuarter[];
  totalProjectedMinor: bigint;
  /** Number of completed distributions used in the rolling average. */
  basisCount: number;
}

/**
 * Compute the forecast. Returns zero-value quarters with
 * `low_confidence` if there aren't enough completed distributions.
 */
export function computeDistributionForecast(
  input: ForecastInput,
): ForecastResult {
  const horizon = Math.max(1, input.horizonQuarters ?? 4);
  const trim = input.trimOutliers ?? true;
  const asOf = input.asOf ?? new Date();

  const sorted = [...input.completedDistributions].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
  );

  let basis = sorted.map((d) => d.investorShareMinor);
  let confidence: ForecastedQuarter["confidence"] = "low_confidence";
  let avg = 0n;

  if (basis.length >= 2) {
    if (trim && basis.length >= 4) {
      // Drop highest + lowest — surfaces a less surprise-prone average.
      const sortedNumeric = [...basis].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      basis = sortedNumeric.slice(1, -1);
      confidence = "trimmed_average";
    } else {
      confidence = "rolling_average";
    }
    let sum = 0n;
    for (const b of basis) sum += b;
    avg = sum / BigInt(basis.length);
  }

  const quarters: ForecastedQuarter[] = [];
  let total = 0n;
  // Walk forward by quarter from "next quarter after asOf".
  const startQuarter = (Math.floor(asOf.getUTCMonth() / 3) + 2) as 1 | 2 | 3 | 4 | 5; // 2..5
  let q: number = startQuarter;
  let y = asOf.getUTCFullYear();
  while (q > 4) {
    q -= 4;
    y += 1;
  }
  for (let i = 0; i < horizon; i++) {
    quarters.push({
      quarter: q as 1 | 2 | 3 | 4,
      year: y,
      projectedAmountMinor: avg,
      confidence,
    });
    total += avg;
    q++;
    if (q > 4) {
      q -= 4;
      y += 1;
    }
  }

  return {
    quarters,
    totalProjectedMinor: total,
    basisCount: basis.length,
  };
}
