/**
 * Stage 5.D — AI QS Cost Analyst pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export interface CostCategoryInput {
  categoryKey: string;
  categoryName: string;
  budgetMinor: number;
  committedMinor: number;
  actualMinor: number;
  /** Physical progress 0-100 against this category. */
  progressPct: number;
}

export interface CategoryAnalysis {
  categoryKey: string;
  categoryName: string;
  burnPct: number;
  /** Forecast at completion (FAC) using straight-line extrapolation. */
  facMinor: number;
  /** % overrun over budget when projected to completion. */
  forecastOverrunPct: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
}

export interface QsAnalystOutput {
  categoryAnalyses: CategoryAnalysis[];
  topConcerns: CategoryAnalysis[];
  recommendedActions: string[];
  totalCommittedMinor: number;
  totalActualMinor: number;
  totalForecastAtCompletionMinor: number;
}

function classifyOverrun(pct: number): CategoryAnalysis["severity"] {
  if (pct >= 30) return "critical";
  if (pct >= 15) return "high";
  if (pct >= 5) return "medium";
  if (pct > 0) return "low";
  return "info";
}

export function analyzeCostCategories(
  inputs: CostCategoryInput[],
): QsAnalystOutput {
  const categoryAnalyses: CategoryAnalysis[] = inputs.map((c) => {
    const burnPct = c.budgetMinor > 0 ? (c.actualMinor / c.budgetMinor) * 100 : 0;
    // FAC: actual + (remaining budget × actual run rate).
    const fac =
      c.progressPct > 0
        ? Math.round((c.actualMinor / (c.progressPct / 100)))
        : c.committedMinor;
    const forecastOverrunPct =
      c.budgetMinor > 0 ? ((fac - c.budgetMinor) / c.budgetMinor) * 100 : 0;
    return {
      categoryKey: c.categoryKey,
      categoryName: c.categoryName,
      burnPct,
      facMinor: fac,
      forecastOverrunPct,
      severity: classifyOverrun(forecastOverrunPct),
    };
  });

  const topConcerns = [...categoryAnalyses]
    .filter((a) => a.severity !== "info")
    .sort((a, b) => b.forecastOverrunPct - a.forecastOverrunPct)
    .slice(0, 5);

  const totalCommittedMinor = inputs.reduce((a, c) => a + c.committedMinor, 0);
  const totalActualMinor = inputs.reduce((a, c) => a + c.actualMinor, 0);
  const totalForecastAtCompletionMinor = categoryAnalyses.reduce(
    (a, c) => a + c.facMinor,
    0,
  );

  const recommendedActions: string[] = [];
  for (const c of topConcerns) {
    if (c.severity === "critical") {
      recommendedActions.push(
        `Re-negotiate ${c.categoryName} contracts immediately — projected ${c.forecastOverrunPct.toFixed(0)}% overrun.`,
      );
    } else if (c.severity === "high") {
      recommendedActions.push(
        `Issue change order or scope reduction for ${c.categoryName} (${c.forecastOverrunPct.toFixed(0)}% overrun forecast).`,
      );
    }
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push(
      "All categories tracking within tolerance — no immediate actions required.",
    );
  }

  return {
    categoryAnalyses,
    topConcerns,
    recommendedActions,
    totalCommittedMinor,
    totalActualMinor,
    totalForecastAtCompletionMinor,
  };
}
