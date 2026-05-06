/**
 * Stage 5.B.4 — Pure monthly cashflow projection helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Walks month-by-month from `startMonth` for `horizonMonths`, bucketing
 * each inflow / outflow line into its month, computing per-month net,
 * cumulative cash, peak capital required, and identified cash gaps.
 *
 * All amounts in USD-minor (cents) as `number`.
 */

export type GapSeverity = "minor" | "moderate" | "critical";

export interface MonthlyCashflowLine {
  /** First day of the month this line affects. */
  month: Date;
  amount: number;
}

export interface MonthlyCashflowInput {
  startMonth: Date;
  horizonMonths: number;
  startingCash: number;

  // Inflows
  expectedSalesByMonth: Array<{
    month: Date;
    amount: number;
    certainty: "committed" | "likely" | "speculative";
  }>;
  expectedCapitalCallsByMonth: MonthlyCashflowLine[];
  expectedRentalIncomeByMonth: MonthlyCashflowLine[];

  // Outflows — recurring
  monthlyPayrollCommitment: number;
  monthlyFixedCosts: number;

  // Outflows — bucketed by month
  expectedConstructionCostsByMonth: MonthlyCashflowLine[];
  expectedTaxPaymentsByMonth: MonthlyCashflowLine[];
  expectedDistributionsByMonth: MonthlyCashflowLine[];
  expectedLandPaymentsByMonth: MonthlyCashflowLine[];
}

export interface MonthlyCashflowProjection {
  month: Date;
  inflow: number;
  outflow: number;
  net: number;
  cumulativeCash: number;
}

export interface CashflowOutput {
  projections: MonthlyCashflowProjection[];
  peakCapitalRequired: number;
  peakAt: Date;
  identifiedGaps: Array<{
    month: Date;
    gapAmount: number;
    severity: GapSeverity;
  }>;
  totalInflow: number;
  totalOutflow: number;
  endingCash: number;
}

function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function sameMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

function classifyGap(absGap: number): GapSeverity {
  if (absGap >= 500_000 * 100) return "critical"; // >= $500k
  if (absGap >= 100_000 * 100) return "moderate"; // >= $100k
  return "minor";
}

export function computeMonthlyCashflowProjection(
  input: MonthlyCashflowInput,
): CashflowOutput {
  if (
    !Number.isInteger(input.horizonMonths) ||
    input.horizonMonths <= 0 ||
    input.horizonMonths > 60
  ) {
    throw new Error("cashflow: horizonMonths must be in 1..60");
  }
  if (!Number.isFinite(input.startingCash)) {
    throw new Error("cashflow: startingCash not finite");
  }
  if (input.monthlyPayrollCommitment < 0 || input.monthlyFixedCosts < 0) {
    throw new Error("cashflow: monthly recurring costs must be >= 0");
  }

  const start = firstOfMonth(input.startMonth);
  const projections: MonthlyCashflowProjection[] = [];
  let cumulative = input.startingCash;

  function sumLinesIn(lines: MonthlyCashflowLine[], targetMonth: Date): number {
    return lines.reduce(
      (acc, l) =>
        sameMonth(firstOfMonth(l.month), targetMonth) ? acc + l.amount : acc,
      0,
    );
  }

  for (let i = 0; i < input.horizonMonths; i++) {
    const monthDate = addMonths(start, i);

    // Inflows.
    const sales = input.expectedSalesByMonth
      .filter((s) => sameMonth(firstOfMonth(s.month), monthDate))
      .reduce((acc, s) => acc + s.amount, 0);
    const capCalls = sumLinesIn(input.expectedCapitalCallsByMonth, monthDate);
    const rental = sumLinesIn(input.expectedRentalIncomeByMonth, monthDate);
    const inflow = sales + capCalls + rental;

    // Outflows.
    const construction = sumLinesIn(
      input.expectedConstructionCostsByMonth,
      monthDate,
    );
    const taxes = sumLinesIn(input.expectedTaxPaymentsByMonth, monthDate);
    const distributions = sumLinesIn(
      input.expectedDistributionsByMonth,
      monthDate,
    );
    const landPayments = sumLinesIn(
      input.expectedLandPaymentsByMonth,
      monthDate,
    );
    const outflow =
      input.monthlyPayrollCommitment +
      input.monthlyFixedCosts +
      construction +
      taxes +
      distributions +
      landPayments;

    const net = inflow - outflow;
    cumulative += net;
    projections.push({
      month: monthDate,
      inflow,
      outflow,
      net,
      cumulativeCash: cumulative,
    });
  }

  // Peak required = lowest point of cumulative cash; if positive throughout,
  // peak required = 0 (no external capital needed beyond starting cash).
  let lowest = Infinity;
  let lowestAt: Date = start;
  for (const p of projections) {
    if (p.cumulativeCash < lowest) {
      lowest = p.cumulativeCash;
      lowestAt = p.month;
    }
  }
  const peakCapitalRequired = lowest < 0 ? -lowest : 0;

  // Identified gaps: any month where cumulative goes below zero.
  const identifiedGaps = projections
    .filter((p) => p.cumulativeCash < 0)
    .map((p) => ({
      month: p.month,
      gapAmount: -p.cumulativeCash,
      severity: classifyGap(-p.cumulativeCash),
    }));

  const totalInflow = projections.reduce((a, p) => a + p.inflow, 0);
  const totalOutflow = projections.reduce((a, p) => a + p.outflow, 0);
  const endingCash =
    projections.length > 0
      ? projections[projections.length - 1].cumulativeCash
      : input.startingCash;

  return {
    projections,
    peakCapitalRequired,
    peakAt: lowestAt,
    identifiedGaps,
    totalInflow,
    totalOutflow,
    endingCash,
  };
}
