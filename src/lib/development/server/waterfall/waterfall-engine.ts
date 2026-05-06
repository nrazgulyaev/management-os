import "server-only";

import {
  computeWaterfallAllocation,
  type WaterfallInput,
  type WaterfallOutput,
  type WaterfallRuleType,
} from "./waterfall-helpers";
import {
  resolveActiveRuleForCommitment,
  getWaterfallRule,
} from "./waterfall-queries";

/**
 * Look up the active rule for a commitment (or project) and run the
 * pure helper. Returns both the rule row and the computed allocation,
 * suitable for HITL preview cards on the operator side.
 */
export async function previewAllocationForCommitment(input: {
  commitmentId: string;
  projectId: string;
  totalDistributable: number;
  arconiqueCapitalContributed: number;
  arconiqueCapitalReturned: number;
  investorCapitalContributed: number;
  investorCapitalReturned: number;
  cumulativeProfitDistributed: number;
}): Promise<{
  rule: Awaited<ReturnType<typeof resolveActiveRuleForCommitment>> | null;
  output: WaterfallOutput | null;
}> {
  const rule = await resolveActiveRuleForCommitment({
    commitmentId: input.commitmentId,
    projectId: input.projectId,
  });
  if (!rule) return { rule: null, output: null };

  const waterfallInput: WaterfallInput = {
    totalDistributable: input.totalDistributable,
    arconiqueCapitalContributed: input.arconiqueCapitalContributed,
    arconiqueCapitalReturned: input.arconiqueCapitalReturned,
    investorCapitalContributed: input.investorCapitalContributed,
    investorCapitalReturned: input.investorCapitalReturned,
    cumulativeProfitDistributed: input.cumulativeProfitDistributed,
    ruleType: rule.ruleType as WaterfallRuleType,
    ruleParameters: (rule.ruleParameters ?? {}) as Record<string, unknown>,
  };
  const output = computeWaterfallAllocation(waterfallInput);
  return { rule, output };
}

/**
 * Direct preview using a specific rule id — for the simulator UI where
 * the operator wants to see "what if rule X was active?"
 */
export async function simulateAllocationWithRule(input: {
  ruleId: string;
  totalDistributable: number;
  arconiqueCapitalContributed: number;
  arconiqueCapitalReturned: number;
  investorCapitalContributed: number;
  investorCapitalReturned: number;
  cumulativeProfitDistributed: number;
}): Promise<{
  rule: Awaited<ReturnType<typeof getWaterfallRule>> | null;
  output: WaterfallOutput | null;
}> {
  const rule = await getWaterfallRule(input.ruleId);
  if (!rule) return { rule: null, output: null };
  const output = computeWaterfallAllocation({
    totalDistributable: input.totalDistributable,
    arconiqueCapitalContributed: input.arconiqueCapitalContributed,
    arconiqueCapitalReturned: input.arconiqueCapitalReturned,
    investorCapitalContributed: input.investorCapitalContributed,
    investorCapitalReturned: input.investorCapitalReturned,
    cumulativeProfitDistributed: input.cumulativeProfitDistributed,
    ruleType: rule.ruleType as WaterfallRuleType,
    ruleParameters: (rule.ruleParameters ?? {}) as Record<string, unknown>,
  });
  return { rule, output };
}
