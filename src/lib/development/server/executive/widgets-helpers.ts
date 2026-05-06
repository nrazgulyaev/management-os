/**
 * Stage 5.C — Per-widget pure helpers.
 *
 * Each helper takes raw snapshot data + comparison snapshot (e.g., last
 * week) and returns a `WidgetView` that the page renders.
 */

export type Trend = "up" | "down" | "flat";

export interface WidgetView {
  label: string;
  value: string;
  numericValue: number;
  trend: Trend;
  trendDeltaPct: number;
  sparkline?: number[];
  drillHref?: string;
}

export function trendOf(current: number, previous: number): Trend {
  if (!Number.isFinite(previous) || previous === 0) {
    if (current === 0) return "flat";
    return current > 0 ? "up" : "down";
  }
  const delta = (current - previous) / Math.abs(previous);
  if (Math.abs(delta) < 0.01) return "flat";
  return delta > 0 ? "up" : "down";
}

export function trendDeltaPct(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatMinorAsCurrency(
  amountMinor: number,
  currency: string,
): string {
  const major = amountMinor / 100;
  if (currency === "IDR") {
    if (Math.abs(major) >= 1e9) return `Rp ${(major / 1e9).toFixed(1)}B`;
    if (Math.abs(major) >= 1e6) return `Rp ${(major / 1e6).toFixed(1)}M`;
    if (Math.abs(major) >= 1e3) return `Rp ${(major / 1e3).toFixed(0)}k`;
    return `Rp ${major.toFixed(0)}`;
  }
  if (currency === "USD") {
    if (Math.abs(major) >= 1e6) return `$${(major / 1e6).toFixed(1)}M`;
    if (Math.abs(major) >= 1e3) return `$${(major / 1e3).toFixed(0)}k`;
    return `$${major.toFixed(0)}`;
  }
  return `${currency} ${major.toFixed(0)}`;
}

export function buildCashOnHandWidget(
  current: { totalCashOnHandMinor: number; baseCurrency: string },
  previous: { totalCashOnHandMinor: number } | null,
): WidgetView {
  const prev = previous?.totalCashOnHandMinor ?? 0;
  return {
    label: "Cash on hand",
    value: formatMinorAsCurrency(
      current.totalCashOnHandMinor,
      current.baseCurrency,
    ),
    numericValue: current.totalCashOnHandMinor,
    trend: trendOf(current.totalCashOnHandMinor, prev),
    trendDeltaPct: trendDeltaPct(current.totalCashOnHandMinor, prev),
  };
}

export function buildReceivablesAgingWidget(input: {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_over_90: number;
  baseCurrency: string;
}): WidgetView & { breakdown: Array<{ bucket: string; valueMinor: number }> } {
  const total =
    input.current +
    input.days_1_30 +
    input.days_31_60 +
    input.days_61_90 +
    input.days_over_90;
  return {
    label: "Receivables aging",
    value: formatMinorAsCurrency(total, input.baseCurrency),
    numericValue: total,
    trend: "flat",
    trendDeltaPct: 0,
    breakdown: [
      { bucket: "Current", valueMinor: input.current },
      { bucket: "1–30d", valueMinor: input.days_1_30 },
      { bucket: "31–60d", valueMinor: input.days_31_60 },
      { bucket: "61–90d", valueMinor: input.days_61_90 },
      { bucket: ">90d", valueMinor: input.days_over_90 },
    ],
  };
}

export function buildProjectsHealthWidget(input: {
  onTrack: number;
  atRisk: number;
  delayed: number;
}): WidgetView & {
  breakdown: { onTrack: number; atRisk: number; delayed: number };
  healthPct: number;
} {
  const total = input.onTrack + input.atRisk + input.delayed;
  const healthPct = total > 0 ? (input.onTrack / total) * 100 : 0;
  return {
    label: "Projects on track",
    value: total === 0 ? "—" : `${input.onTrack}/${total}`,
    numericValue: input.onTrack,
    trend: "flat",
    trendDeltaPct: 0,
    breakdown: input,
    healthPct,
  };
}

export function buildBudgetBurnWidget(input: {
  committedMinor: number;
  actualMinor: number;
  baseCurrency: string;
}): WidgetView & { burnPct: number; remainingMinor: number } {
  const burnPct =
    input.committedMinor > 0
      ? (input.actualMinor / input.committedMinor) * 100
      : 0;
  const remainingMinor = input.committedMinor - input.actualMinor;
  return {
    label: "Budget burn",
    value: `${burnPct.toFixed(1)}%`,
    numericValue: burnPct,
    trend: "flat",
    trendDeltaPct: 0,
    burnPct,
    remainingMinor,
  };
}

export function buildSalesPipelineWidget(input: {
  totalPipelineValueMinor: number;
  hotLeadsCount: number;
  baseCurrency: string;
}): WidgetView & { hotLeadsCount: number } {
  return {
    label: "Sales pipeline",
    value: formatMinorAsCurrency(
      input.totalPipelineValueMinor,
      input.baseCurrency,
    ),
    numericValue: input.totalPipelineValueMinor,
    trend: "flat",
    trendDeltaPct: 0,
    hotLeadsCount: input.hotLeadsCount,
  };
}

export function buildInvestorCapitalWidget(input: {
  committedMinor: number;
  drawnMinor: number;
  baseCurrency: string;
}): WidgetView & { availableMinor: number; drawnPct: number } {
  const drawnPct =
    input.committedMinor > 0
      ? (input.drawnMinor / input.committedMinor) * 100
      : 0;
  return {
    label: "Investor capital",
    value: formatMinorAsCurrency(input.committedMinor, input.baseCurrency),
    numericValue: input.committedMinor,
    trend: "flat",
    trendDeltaPct: 0,
    availableMinor: input.committedMinor - input.drawnMinor,
    drawnPct,
  };
}

export function buildQaQcWidget(input: {
  open: number;
  critical: number;
}): WidgetView & { critical: number } {
  return {
    label: "QA/QC issues open",
    value: `${input.open}`,
    numericValue: input.open,
    trend: input.critical > 0 ? "up" : "flat",
    trendDeltaPct: 0,
    critical: input.critical,
  };
}

export function buildPayrollRunwayWidget(input: {
  weeks: number;
}): WidgetView & { riskLevel: "safe" | "watch" | "concerning" | "critical" } {
  let risk: "safe" | "watch" | "concerning" | "critical" = "safe";
  // Convert weeks → months for risk band consistency with cycle-helpers.
  const months = input.weeks / 4.33;
  if (months < 3) risk = "critical";
  else if (months < 6) risk = "concerning";
  else if (months < 12) risk = "watch";
  return {
    label: "Payroll runway",
    value: `${input.weeks.toFixed(0)}w`,
    numericValue: input.weeks,
    trend: "flat",
    trendDeltaPct: 0,
    riskLevel: risk,
  };
}
