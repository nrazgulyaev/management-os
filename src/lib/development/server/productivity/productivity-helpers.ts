/**
 * Stage 5.H.3 — Pure productivity tracking helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export interface ProductivityRateInput {
  actualHours: number;
  quantityCompleted: number;
  unit: string;
}

export interface ProductivityRateOutput {
  rate: number;
  ratePerHour: number;
  unit: string;
}

export function computeProductivityRate(
  input: ProductivityRateInput,
): ProductivityRateOutput {
  if (
    !Number.isFinite(input.actualHours) ||
    !Number.isFinite(input.quantityCompleted)
  ) {
    throw new Error("productivity: inputs must be finite numbers");
  }
  if (input.actualHours <= 0) {
    return { rate: 0, ratePerHour: 0, unit: input.unit };
  }
  const ratePerHour = input.quantityCompleted / input.actualHours;
  return {
    rate: ratePerHour,
    ratePerHour,
    unit: input.unit,
  };
}

export type BenchmarkPerformance =
  | "above_benchmark"
  | "on_benchmark"
  | "below_benchmark"
  | "critically_below";

export interface BenchmarkComparison {
  variance: number;
  variancePercentage: number;
  performance: BenchmarkPerformance;
}

export function compareToBenchmark(input: {
  actualRate: number;
  benchmarkRate: number;
  trade: string;
}): BenchmarkComparison {
  if (!Number.isFinite(input.actualRate) || !Number.isFinite(input.benchmarkRate)) {
    throw new Error("benchmark: inputs must be finite");
  }
  if (input.benchmarkRate <= 0) {
    return {
      variance: 0,
      variancePercentage: 0,
      performance: "on_benchmark",
    };
  }
  const variance = input.actualRate - input.benchmarkRate;
  const pct = (variance / input.benchmarkRate) * 100;
  let perf: BenchmarkPerformance;
  if (pct >= 5) perf = "above_benchmark";
  else if (pct >= -5) perf = "on_benchmark";
  else if (pct >= -25) perf = "below_benchmark";
  else perf = "critically_below";
  return {
    variance,
    variancePercentage: pct,
    performance: perf,
  };
}

export interface TradeAggregation {
  trade: string;
  totalHours: number;
  totalQuantity: number;
  averageRate: number;
  unit: string;
}

export function aggregateProductivityByTrade(
  logs: Array<{
    trade: string;
    actualHours: number;
    quantityCompleted: number;
    unit: string;
  }>,
): TradeAggregation[] {
  const buckets = new Map<
    string,
    { hours: number; quantity: number; unit: string }
  >();
  for (const l of logs) {
    if (
      !Number.isFinite(l.actualHours) ||
      !Number.isFinite(l.quantityCompleted)
    ) {
      continue;
    }
    const cur = buckets.get(l.trade) ?? {
      hours: 0,
      quantity: 0,
      unit: l.unit,
    };
    cur.hours += l.actualHours;
    cur.quantity += l.quantityCompleted;
    buckets.set(l.trade, cur);
  }
  return Array.from(buckets.entries())
    .map(([trade, b]) => ({
      trade,
      totalHours: b.hours,
      totalQuantity: b.quantity,
      averageRate: b.hours > 0 ? b.quantity / b.hours : 0,
      unit: b.unit,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}
