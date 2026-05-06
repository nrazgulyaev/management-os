import "server-only";

import { runAgent, type AgentRunResult } from "../agent-runner";
import {
  buildTaxAssistantOutput,
  type TransactionForTaxInput,
} from "./tax-assistant-helpers";

export async function runTaxAssistant(args: {
  projectId: string | null;
  triggeredByUserId?: string;
  transactions: TransactionForTaxInput[];
  periodLabel: string;
}): Promise<AgentRunResult> {
  return runAgent({
    agentKey: "tax_assistant",
    projectId: args.projectId,
    invocationType: "user_triggered",
    triggeredByUserId: args.triggeredByUserId,
    buildOutput: async () => {
      const out = buildTaxAssistantOutput(args.transactions);
      return {
        outputCategory: "tax_classification",
        title: `Tax assistant — ${args.periodLabel} (${out.periodCloseReadinessScore}% close-ready)`,
        summary: `${out.unclassifiedCount} unclassified transaction(s); ${out.documentGaps.length} document gap(s).`,
        detailedOutput: out,
        recommendedActions: out.recommendedActions,
        confidenceLevel:
          out.classificationSuggestions.every((s) => s.confidence === "high")
            ? "high"
            : "medium",
      };
    },
  });
}
