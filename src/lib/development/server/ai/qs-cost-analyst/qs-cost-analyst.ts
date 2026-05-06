import "server-only";

import { runAgent, type AgentRunResult } from "../agent-runner";
import {
  analyzeCostCategories,
  type CostCategoryInput,
} from "./qs-cost-analyst-helpers";

export async function runQsCostAnalyst(args: {
  projectId: string;
  triggeredByUserId?: string;
  /** Pre-fetched category data — keeps the agent pure and testable. */
  categories: CostCategoryInput[];
}): Promise<AgentRunResult> {
  return runAgent({
    agentKey: "qs_cost_analyst",
    projectId: args.projectId,
    invocationType: "user_triggered",
    triggeredByUserId: args.triggeredByUserId,
    buildOutput: async () => {
      const analysis = analyzeCostCategories(args.categories);
      const overrunCount = analysis.topConcerns.length;
      return {
        outputCategory: "cost_analysis",
        title: `QS cost analysis — ${overrunCount} concern(s)`,
        summary: `Forecast at completion: ${(analysis.totalForecastAtCompletionMinor / 100).toLocaleString()}; ${overrunCount} categories projected to exceed budget.`,
        detailedOutput: analysis,
        recommendedActions: analysis.recommendedActions,
        confidenceLevel: "medium",
        reasoningSummary:
          "Straight-line FAC extrapolation from physical progress against actual spend.",
      };
    },
  });
}
