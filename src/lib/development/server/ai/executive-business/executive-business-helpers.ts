/**
 * Stage 5.D — AI Executive Business Analyst pure helpers.
 */

export interface ExecutiveBusinessInput {
  periodLabel: string;
  current: {
    cashOnHandMinor: number;
    activeProjects: number;
    projectsOnTrack: number;
    pipelineValueMinor: number;
    contractsSignedThisMonth: number;
    payrollRunwayWeeks: number;
    openCriticalAlerts: number;
  };
  prior?: {
    cashOnHandMinor: number;
    activeProjects: number;
    projectsOnTrack: number;
    pipelineValueMinor: number;
    contractsSignedThisMonth: number;
  };
}

export interface TrendCallout {
  metric: string;
  delta: string;
  direction: "improved" | "worsened" | "flat";
}

export interface ExecutiveBusinessOutput {
  weeklySummary: string;
  trends: TrendCallout[];
  strategicRecommendations: string[];
  crossProjectPatterns: string[];
  keyMetrics: ExecutiveBusinessInput["current"];
}

function pct(curr: number, prior?: number): number {
  if (prior == null || prior === 0) return 0;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

function direction(deltaPct: number): TrendCallout["direction"] {
  if (Math.abs(deltaPct) < 1) return "flat";
  return deltaPct > 0 ? "improved" : "worsened";
}

export function buildExecutiveBusinessOutput(
  input: ExecutiveBusinessInput,
): ExecutiveBusinessOutput {
  const c = input.current;
  const trends: TrendCallout[] = input.prior
    ? [
        {
          metric: "Cash on hand",
          delta: `${pct(c.cashOnHandMinor, input.prior.cashOnHandMinor).toFixed(1)}%`,
          direction: direction(pct(c.cashOnHandMinor, input.prior.cashOnHandMinor)),
        },
        {
          metric: "Pipeline value",
          delta: `${pct(c.pipelineValueMinor, input.prior.pipelineValueMinor).toFixed(1)}%`,
          direction: direction(
            pct(c.pipelineValueMinor, input.prior.pipelineValueMinor),
          ),
        },
        {
          metric: "Contracts signed",
          delta: `${c.contractsSignedThisMonth - input.prior.contractsSignedThisMonth}`,
          direction:
            c.contractsSignedThisMonth - input.prior.contractsSignedThisMonth > 0
              ? "improved"
              : c.contractsSignedThisMonth - input.prior.contractsSignedThisMonth < 0
                ? "worsened"
                : "flat",
        },
      ]
    : [];

  const strategicRecommendations: string[] = [];
  if (c.payrollRunwayWeeks < 26) {
    strategicRecommendations.push(
      `Capital action required: payroll runway ${c.payrollRunwayWeeks.toFixed(0)} weeks.`,
    );
  }
  if (c.openCriticalAlerts > 0) {
    strategicRecommendations.push(
      `Resolve ${c.openCriticalAlerts} critical risk alert(s) before next exec sync.`,
    );
  }
  if (
    c.contractsSignedThisMonth === 0 &&
    c.pipelineValueMinor > 0
  ) {
    strategicRecommendations.push(
      "Conversion stalled — review sales pipeline funnel and re-engage hot leads.",
    );
  }
  if (strategicRecommendations.length === 0) {
    strategicRecommendations.push("No structural action required this period.");
  }

  const crossProjectPatterns: string[] = [];
  if (c.activeProjects >= 3 && c.projectsOnTrack / c.activeProjects < 0.6) {
    crossProjectPatterns.push(
      `${Math.round(((c.activeProjects - c.projectsOnTrack) / c.activeProjects) * 100)}% of projects off-track — investigate shared root cause.`,
    );
  }

  const weeklySummary = [
    `## ${input.periodLabel} executive summary`,
    `Cash position ${(c.cashOnHandMinor / 100).toLocaleString()}; runway ${c.payrollRunwayWeeks.toFixed(0)} weeks.`,
    `${c.activeProjects} active projects (${c.projectsOnTrack} on track).`,
    `${c.contractsSignedThisMonth} contract(s) signed this period.`,
    c.openCriticalAlerts > 0
      ? `**${c.openCriticalAlerts} critical risk alert(s) open.**`
      : "No critical risk alerts open.",
  ].join("\n\n");

  return {
    weeklySummary,
    trends,
    strategicRecommendations,
    crossProjectPatterns,
    keyMetrics: c,
  };
}
