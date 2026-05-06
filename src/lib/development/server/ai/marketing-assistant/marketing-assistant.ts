import "server-only";

import { runAgent, type AgentRunResult } from "../agent-runner";
import {
  buildMarketingOutput,
  type MarketingInput,
} from "./marketing-assistant-helpers";

export async function runMarketingAssistant(args: {
  projectId: string;
  triggeredByUserId?: string;
  input: MarketingInput;
}): Promise<AgentRunResult> {
  return runAgent({
    agentKey: "marketing_assistant",
    projectId: args.projectId,
    invocationType: "user_triggered",
    triggeredByUserId: args.triggeredByUserId,
    buildOutput: async () => {
      const out = buildMarketingOutput(args.input);
      return {
        outputCategory: `marketing_${args.input.contentType}`,
        title: `${args.input.contentType} for ${args.input.projectName}`,
        summary: out.generatedContent.slice(0, 240),
        detailedOutput: out,
        recommendedActions: [
          `Post at ${out.bestTimeRecommendation} for best historical engagement.`,
        ],
        confidenceLevel: "medium",
        reasoningSummary: out.reasoning,
      };
    },
  });
}
