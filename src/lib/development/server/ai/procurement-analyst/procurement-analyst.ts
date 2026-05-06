import "server-only";

import { runAgent, type AgentRunResult } from "../agent-runner";
import {
  analyzeSuppliers,
  type SupplierMetricsInput,
} from "./procurement-analyst-helpers";

export async function runProcurementAnalyst(args: {
  projectId: string;
  triggeredByUserId?: string;
  suppliers: SupplierMetricsInput[];
}): Promise<AgentRunResult> {
  return runAgent({
    agentKey: "procurement_analyst",
    projectId: args.projectId,
    invocationType: "user_triggered",
    triggeredByUserId: args.triggeredByUserId,
    buildOutput: async () => {
      const analysis = analyzeSuppliers(args.suppliers);
      return {
        outputCategory: "supplier_assessment",
        title: `Procurement assessment — ${analysis.underperforming.length} underperforming`,
        summary: `Analysed ${analysis.ranked.length} suppliers; ${analysis.preferred.length} preferred, ${analysis.underperforming.length} underperforming.`,
        detailedOutput: analysis,
        recommendedActions: analysis.recommendedActions,
        confidenceLevel: "medium",
      };
    },
  });
}
