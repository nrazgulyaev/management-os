import "server-only";

import { runAgent, type AgentRunResult } from "../agent-runner";
import {
  buildExecutiveBusinessOutput,
  type ExecutiveBusinessInput,
} from "./executive-business-helpers";

export async function runExecutiveBusinessAnalyst(args: {
  triggeredByUserId?: string;
  input: ExecutiveBusinessInput;
}): Promise<AgentRunResult> {
  return runAgent({
    agentKey: "executive_business",
    projectId: null,
    invocationType: "user_triggered",
    triggeredByUserId: args.triggeredByUserId,
    buildOutput: async () => {
      const out = buildExecutiveBusinessOutput(args.input);
      return {
        outputCategory: "executive_synthesis",
        title: `Executive synthesis — ${args.input.periodLabel}`,
        summary: out.weeklySummary.split("\n").slice(0, 3).join(" "),
        detailedOutput: out,
        recommendedActions: out.strategicRecommendations,
        confidenceLevel: "medium",
      };
    },
  });
}
